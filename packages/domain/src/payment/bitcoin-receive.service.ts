import {serializeError} from '@bim/lib/error';
import {randomUUID} from 'node:crypto';
import type {Logger} from 'pino';
import {AccountId} from '../account';
import type {Account} from '../account';
import {InvalidOwnerSignature} from '../notifications';
import type {NotificationGateway, SignatureProcessor, StarknetCall, StarknetGateway, SwapGateway, TransactionRepository} from '../ports';
import {type Amount, BuildExpiredError, ExternalServiceError, ForbiddenError, InsufficientBalanceError, type StarknetAddress, type StarknetConfig} from '../shared';
import type {SwapService} from '../swap';
import {TransactionHash} from '../user/types';
import type {ReceiveBuildCache} from './receive-build.cache';
import type {ReceiveService} from './receive.service';
import type {BitcoinReceiveResult} from './receive.types';
import type {WebAuthnAssertion} from './types';

// =============================================================================
// Dependencies
// =============================================================================

export interface BitcoinReceiveServiceDeps {
  receiveService: ReceiveService;
  swapService: SwapService;
  starknetGateway: StarknetGateway;
  dexGateway: SwapGateway;
  signatureProcessor: SignatureProcessor;
  receiveBuildCache: ReceiveBuildCache;
  transactionRepository: TransactionRepository;
  notificationGateway: NotificationGateway;
  starknetConfig: StarknetConfig;
  logger: Logger;
}

// =============================================================================
// Service Class
// =============================================================================

/**
 * Handles the Bitcoin two-phase receive flow:
 * - Phase 1: auto-swap WBTC→STRK if needed, build commit typed data, cache
 * - Phase 2: sign + execute commit, wait, save swap, complete
 */
export class BitcoinReceiveService {
  private readonly log: Logger;

  constructor(private readonly deps: BitcoinReceiveServiceDeps) {
    this.log = deps.logger.child({name: 'bitcoin-receive.service.ts'});
  }

  /**
   * Handles a Bitcoin pending commit: auto-swap if needed, build typed data, cache for signing.
   */
  async handlePendingCommit(params: {
    swapId: string;
    commitCalls: readonly StarknetCall[];
    amount: Amount;
    expiresAt: Date;
    starknetAddress: StarknetAddress;
    account: Account;
    description: string | undefined;
    useUriPrefix: boolean;
  }): Promise<{buildId: string; messageHash: string}> {
    const approveInfo = extractApproveAmount(params.commitCalls);

    const finalCalls = await this.maybePrependAutoSwapCalls(params.commitCalls, params.starknetAddress, approveInfo);

    const {typedData, messageHash} = await this.buildCommitTypedData(params.starknetAddress, finalCalls, approveInfo);

    const buildId = randomUUID();
    this.deps.receiveBuildCache.set(buildId, {
      swapId: params.swapId,
      typedData,
      senderAddress: params.starknetAddress,
      accountId: params.account.id,
      amount: params.amount,
      expiresAt: params.expiresAt,
      description: params.description,
      useUriPrefix: params.useUriPrefix,
      createdAt: Date.now(),
    });

    return {buildId, messageHash};
  }

  /**
   * Commits a Bitcoin receive: sign, execute, wait for confirmation, save, complete.
   */
  async commitAndComplete(params: {
    buildId: string;
    assertion: WebAuthnAssertion;
    account: Account;
  }): Promise<{network: 'bitcoin'} & BitcoinReceiveResult> {
    const {account} = params;

    const build = this.deps.receiveBuildCache.consume(params.buildId);
    if (!build) {
      throw new BuildExpiredError();
    }

    if (account.id !== build.accountId) {
      throw new ForbiddenError('Build does not belong to this account');
    }

    const signature = this.deps.signatureProcessor.process(params.assertion, account.publicKey);

    // Execute commit transaction via AVNU paymaster
    let txHash: string;
    try {
      ({txHash} = await this.deps.starknetGateway.executeSignedCalls({
        senderAddress: build.senderAddress,
        typedData: build.typedData,
        signature,
      }));
    } catch (executeError) {
      if (executeError instanceof ExternalServiceError
          && executeError.message.includes('invalid-owner-sig')) {
        const alertMessage = InvalidOwnerSignature.build({
          senderAddress: build.senderAddress,
          publicKey: account.publicKey,
          typedData: build.typedData,
          signature,
          error: executeError.message,
          network: this.deps.starknetConfig.network,
        });
        this.deps.notificationGateway.send(alertMessage).catch((err: unknown) => {
          this.log.warn({cause: serializeError(err)}, 'Failed to send invalid-owner-sig alert');
        });
      }
      throw executeError;
    }

    this.log.info({swapId: build.swapId, txHash}, 'Bitcoin receive commit transaction submitted');

    await this.deps.starknetGateway.waitForTransaction(txHash);

    const starknetAddress = account.requireStarknetAddress();
    await this.deps.swapService.saveBitcoinCommit({
      swapId: build.swapId,
      destinationAddress: starknetAddress,
      amount: build.amount,
      description: build.description ?? 'Received',
      accountId: build.accountId,
      commitTxHash: txHash,
      expiresAt: build.expiresAt,
    });

    // Label the commit transaction as "Security deposit" (non-fatal)
    try {
      await this.deps.transactionRepository.saveDescription(
        TransactionHash.of(txHash), AccountId.of(build.accountId), 'Security deposit',
      );
    } catch (descErr) {
      this.log.warn({txHash, err: descErr}, 'Failed to save security deposit description (non-fatal)');
    }

    return this.deps.receiveService.completeBitcoinReceive({
      swapId: build.swapId,
      useUriPrefix: build.useUriPrefix,
    });
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private async maybePrependAutoSwapCalls(
    commitCalls: readonly StarknetCall[],
    starknetAddress: StarknetAddress,
    approveInfo: ReturnType<typeof extractApproveAmount>,
  ): Promise<StarknetCall[]> {
    const {strkTokenAddress} = this.deps.starknetConfig;

    if (approveInfo?.tokenAddress.toLowerCase() !== strkTokenAddress.toLowerCase()) {
      return [...commitCalls];
    }

    const strkBalance = await this.deps.starknetGateway.getBalance({address: starknetAddress, token: 'STRK'});
    const rawDeficit = approveInfo.amount - strkBalance;
    if (rawDeficit <= 0n) {
      return [...commitCalls];
    }

    const ONE_STRK = 10n ** 18n;
    const MIN_SWAP = 50n * ONE_STRK;
    const deficitWithBuffer = (rawDeficit * 110n) / 100n;
    const rounded = ((deficitWithBuffer + ONE_STRK - 1n) / ONE_STRK) * ONE_STRK;
    const deficit = rounded < MIN_SWAP ? MIN_SWAP : rounded; // NOSONAR S7766 - Math.max does not support BigInt
    this.log.info({
      requiredStrk: approveInfo.amount.toString(),
      currentStrk: strkBalance.toString(),
      deficit: deficit.toString(),
    }, 'STRK deficit detected, auto-swapping WBTC → STRK');

    const swapResult = await this.deps.dexGateway.getSwapCalls({
      sellToken: this.deps.starknetConfig.wbtcTokenAddress,
      buyToken: strkTokenAddress,
      buyAmount: deficit,
      takerAddress: starknetAddress.toString(),
    });

    const wbtcBalance = await this.deps.starknetGateway.getBalance({address: starknetAddress, token: 'WBTC'});
    if (wbtcBalance < swapResult.sellAmount) {
      throw new InsufficientBalanceError(
        swapResult.sellAmount, this.deps.starknetConfig.wbtcTokenAddress, 'security_deposit', 'WBTC', 8,
      );
    }

    return [...swapResult.calls, ...commitCalls];
  }

  private async buildCommitTypedData(
    starknetAddress: StarknetAddress,
    calls: StarknetCall[],
    approveInfo: ReturnType<typeof extractApproveAmount>,
  ): Promise<{typedData: unknown; messageHash: string}> {
    try {
      return await this.deps.starknetGateway.buildCalls({senderAddress: starknetAddress, calls});
    } catch (err) {
      if (err instanceof InsufficientBalanceError && approveInfo) {
        throw new InsufficientBalanceError(approveInfo.amount, approveInfo.tokenAddress, 'security_deposit', 'STRK', 18);
      }
      throw err;
    }
  }
}

function extractApproveAmount(
  calls: readonly StarknetCall[]
): {amount: bigint; tokenAddress: string} | undefined {
  const approveCall = calls.find(c => c.entrypoint === 'approve');
  if (!approveCall || approveCall.calldata.length < 3) return undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- length >= 3 checked above
    const low = BigInt(approveCall.calldata[1]!);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const high = BigInt(approveCall.calldata[2]!);
    return {amount: low + (high << 128n), tokenAddress: approveCall.contractAddress};
  } catch {
    return undefined;
  }
}
