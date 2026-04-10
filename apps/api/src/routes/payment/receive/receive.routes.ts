import {AccountId} from '@bim/domain/account';
import type {BitcoinReceiveResult, ReceiveResult} from '@bim/domain/payment';
import type {StarknetCall} from '@bim/domain/ports';
import {Amount, InsufficientBalanceError} from '@bim/domain/shared';
import {TransactionHash} from '@bim/domain/user';
import type {TypedResponse} from 'hono';
import {Hono} from 'hono';
import {randomUUID} from 'node:crypto';

import {WebAuthnSignatureProcessor} from '../../../adapters';
import type {AppContext} from '../../../app-context';
import {type ApiErrorResponse, createErrorResponse, ErrorCode, handleDomainError} from '../../../errors';
import type {SwapMonitor} from '../../../monitoring/swap.monitor';
import type {AuthenticatedHono} from '../../../types';
import {ReceiveBuildCache} from './receive-build.cache';
import type {
  BitcoinReceiveCommitResponse,
  BitcoinReceivePendingCommitResponse,
  ReceiveBody,
  ReceiveCommitBody,
  ReceiveResponse
} from './receive.types';
import {ReceiveCommitSchema, ReceiveSchema} from './receive.types';

// =============================================================================
// Routes
// =============================================================================

export function createReceiveRoutes(
  appContext: AppContext,
  swapMonitor?: SwapMonitor | null,
): AuthenticatedHono {
  const log = appContext.logger.child({name: 'receive.routes.ts'});
  const app: AuthenticatedHono = new Hono();

  const {receive: receiveService, swap: swapService} = appContext.services;
  const buildCache = new ReceiveBuildCache();
  const signatureProcessor = new WebAuthnSignatureProcessor({
    origin: appContext.webauthn.origin,
    rpId: appContext.webauthn.rpId,
  }, log);

  // ---------------------------------------------------------------------------
  // Create receive request
  // For Lightning/Starknet: returns data immediately.
  // For Bitcoin: returns commit data for WebAuthn signing (two-phase flow).
  // ---------------------------------------------------------------------------

  app.post('/', async (honoCtx): Promise<TypedResponse<ReceiveResponse | ApiErrorResponse>> => {
    try {
      const input: ReceiveBody = ReceiveSchema.parse(await honoCtx.req.json());

      const account = honoCtx.get('account');
      const starknetAddress = account.getStarknetAddress();
      if (!starknetAddress) {
        return createErrorResponse(honoCtx, 400, ErrorCode.ACCOUNT_NOT_DEPLOYED, 'Account not deployed');
      }

      const amount = input.amount
        ? Amount.ofSatoshi(BigInt(input.amount))
        : undefined;
      const description = input.description?.trim();

      const result = await receiveService.receive({
        network: input.network,
        destinationAddress: starknetAddress,
        ...(amount !== undefined && {amount}),
        description,
        accountId: account.id,
        useUriPrefix: input.useUriPrefix,
      });

      // Bitcoin two-phase flow: build commit typed data for WebAuthn signing
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive: guard against future ReceiveResult variants
      if (result.network === 'bitcoin' && 'status' in result && result.status === 'pending_commit') {
        // Extract approve amount from commitCalls (for error enrichment + auto-swap)
        const approveInfo = extractApproveAmount(result.commitCalls);

        // Auto-swap WBTC → STRK if the account lacks sufficient STRK for the commit
        let finalCalls: StarknetCall[] = [...result.commitCalls];
        const {strkTokenAddress} = appContext.starknetConfig;

        if (approveInfo?.tokenAddress.toLowerCase() === strkTokenAddress.toLowerCase()) {
          const strkBalance = await appContext.gateways.starknet.getBalance({
            address: starknetAddress,
            token: 'STRK',
          });
          const rawDeficit = approveInfo.amount - strkBalance;

          if (rawDeficit > 0n) {
            // Add 10% buffer, round up to whole STRK, enforce minimum to avoid
            // DEX "insufficient input amount" errors on tiny swaps.
            const ONE_STRK = 10n ** 18n;
            const MIN_SWAP = 50n * ONE_STRK; // 50 STRK — below this, DEX pools round to 0
            const deficitWithBuffer = (rawDeficit * 110n) / 100n;
            const rounded = ((deficitWithBuffer + ONE_STRK - 1n) / ONE_STRK) * ONE_STRK;
            const deficit = rounded < MIN_SWAP ? MIN_SWAP : rounded;
            log.info({
              requiredStrk: approveInfo.amount.toString(),
              currentStrk: strkBalance.toString(),
              deficit: deficit.toString(),
            }, 'STRK deficit detected, auto-swapping WBTC → STRK');

            const swapResult = await appContext.gateways.dex.getSwapCalls({
              sellToken: appContext.starknetConfig.wbtcTokenAddress,
              buyToken: strkTokenAddress,
              buyAmount: deficit,
              takerAddress: starknetAddress.toString(),
            });

            log.info({
              sellAmount: swapResult.sellAmount.toString(),
              buyAmount: swapResult.buyAmount.toString(),
              swapCallCount: swapResult.calls.length,
            }, 'AVNU swap calls obtained, prepending to commit calls');

            // Pre-check: verify the account has enough WBTC to cover the auto-swap
            const wbtcBalance = await appContext.gateways.starknet.getBalance({
              address: starknetAddress,
              token: 'WBTC',
            });
            if (wbtcBalance < swapResult.sellAmount) {
              log.warn({
                requiredWbtc: swapResult.sellAmount.toString(),
                currentWbtc: wbtcBalance.toString(),
                securityDepositStrk: approveInfo.amount.toString(),
              }, 'Insufficient WBTC balance to cover security deposit auto-swap');
              throw new InsufficientBalanceError(
                swapResult.sellAmount, appContext.starknetConfig.wbtcTokenAddress, 'security_deposit', 'WBTC', 8,
              );
            }

            finalCalls = [...swapResult.calls, ...result.commitCalls];
          }
        }

        // Build typed data via AVNU paymaster
        let buildResult: {typedData: unknown; messageHash: string};
        try {
          buildResult = await appContext.gateways.starknet.buildCalls({
            senderAddress: starknetAddress,
            calls: finalCalls,
          });
        } catch (err) {
          if (err instanceof InsufficientBalanceError && approveInfo) {
            throw new InsufficientBalanceError(approveInfo.amount, approveInfo.tokenAddress, 'security_deposit', 'STRK', 18);
          }
          throw err;
        }

        const {typedData, messageHash} = buildResult;

        // Cache for the commit step
        const buildId = randomUUID();
        buildCache.set(buildId, {
          swapId: result.swapId,
          typedData,
          senderAddress: starknetAddress,
          accountId: account.id,
          amount: result.amount,
          expiresAt: result.expiresAt,
          description,
          useUriPrefix: input.useUriPrefix,
          createdAt: Date.now(),
        });

        return honoCtx.json<BitcoinReceivePendingCommitResponse>({
          network: 'bitcoin',
          status: 'pending_commit',
          buildId,
          messageHash,
          credentialId: account.credentialId,
          swapId: result.swapId,
          amount: {value: Number(result.amount.getSat()), currency: 'SAT'},
          expiresAt: result.expiresAt.toISOString(),
        });
      }

      swapMonitor?.ensureRunning();
      return honoCtx.json<ReceiveResponse>(serializeReceiveResult(result));
    } catch (error) {
      return handleDomainError(honoCtx, error, log);
    }
  });

  // ---------------------------------------------------------------------------
  // Commit Bitcoin receive (phase 2: sign + submit commit + get deposit address)
  // ---------------------------------------------------------------------------

  app.post('/commit', async (honoCtx): Promise<TypedResponse<BitcoinReceiveCommitResponse | ApiErrorResponse>> => {
    try {
      const input: ReceiveCommitBody = ReceiveCommitSchema.parse(await honoCtx.req.json());

      const account = honoCtx.get('account');

      // 1. Retrieve cached build (single-use)
      const build = buildCache.consume(input.buildId);
      if (!build) {
        return createErrorResponse(honoCtx, 400, ErrorCode.BUILD_EXPIRED, 'Build expired or not found');
      }

      // 2. Verify the requesting account matches the build's account
      if (account.id !== build.accountId) {
        return createErrorResponse(honoCtx, 403, ErrorCode.FORBIDDEN, 'Build does not belong to this account');
      }

      // 3. Process WebAuthn assertion into Argent signature
      const signature = signatureProcessor.process(input.assertion, account.publicKey);

      // 4. Execute commit transaction via AVNU paymaster
      const {txHash} = await appContext.gateways.starknet.executeSignedCalls({
        senderAddress: build.senderAddress,
        typedData: build.typedData,
        signature,
      });

      log.info({swapId: build.swapId, txHash}, 'Bitcoin receive commit transaction submitted');

      // 5. Wait for Starknet confirmation
      await appContext.gateways.starknet.waitForTransaction(txHash);

      // 6. Save swap to DB immediately — ensures SwapMonitor can track it
      //    even if subsequent steps fail (see doc/flow/receive-bitcoin-swap-commit.md —
      //    "Why the swap is persisted before completion")
      const starknetAddress = account.requireStarknetAddress();
      await swapService.saveBitcoinCommit({
        swapId: build.swapId,
        destinationAddress: starknetAddress,
        amount: build.amount,
        description: build.description || 'Received',
        accountId: build.accountId,
        commitTxHash: txHash,
        expiresAt: build.expiresAt,
      });

      // 6b. Label the commit transaction as "Security deposit" (non-fatal)
      try {
        await appContext.repositories.transaction.saveDescription(
          TransactionHash.of(txHash), AccountId.of(build.accountId), 'Security deposit',
        );
      } catch (descErr) {
        log.warn({txHash, err: descErr}, 'Failed to save security deposit description (non-fatal)');
      }

      // 7. Complete the swap (SDK detects on-chain commit, returns deposit address)
      const completeResult = await receiveService.completeBitcoinReceive({
        swapId: build.swapId,
        useUriPrefix: build.useUriPrefix,
      });

      swapMonitor?.ensureRunning();
      return honoCtx.json<BitcoinReceiveCommitResponse>({
        network: 'bitcoin',
        swapId: completeResult.swapId,
        depositAddress: completeResult.depositAddress.toString(),
        bip21Uri: completeResult.bip21Uri,
        amount: {value: Number(completeResult.amount.getSat()), currency: 'SAT'},
        expiresAt: completeResult.expiresAt.toISOString(),
      });
    } catch (error) {
      return handleDomainError(honoCtx, error, log);
    }
  });

  return app;
}

// =============================================================================
// Serialization
// =============================================================================

/**
 * Extracts the approve amount and token address from commitCalls.
 * The approve call has entrypoint 'approve' with calldata [spender, amount_low, amount_high].
 * Amount is u256 = low + high * 2^128.
 */
function extractApproveAmount(
  calls: readonly StarknetCall[]
): {amount: bigint; tokenAddress: string} | undefined {
  const approveCall = calls.find(c => c.entrypoint === 'approve');
  if (!approveCall || approveCall.calldata.length < 3) return undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- length >= 3 checked above, try/catch handles any runtime issue
    const low = BigInt(approveCall.calldata[1]!);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const high = BigInt(approveCall.calldata[2]!);
    return {
      amount: low + (high << 128n),
      tokenAddress: approveCall.contractAddress,
    };
  } catch {
    return undefined;
  }
}

function serializeReceiveResult(result: ReceiveResult): ReceiveResponse {
  switch (result.network) {
    case 'starknet':
      return {
        network: 'starknet',
        address: result.address.toString(),
        uri: result.uri,
      };
    case 'lightning':
      return {
        network: 'lightning',
        swapId: result.swapId,
        invoice: result.invoice.toString(),
        amount: {value: Number(result.amount.getSat()), currency: 'SAT'},
        expiresAt: result.expiresAt.toISOString(),
      };
    case 'bitcoin': {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive: guard against future ReceiveResult variants
      if ('status' in result && result.status === 'pending_commit') {
        // Should not reach here — handled above in the route
        throw new Error('Unexpected pending_commit result in serializeReceiveResult');
      }
      const btcResult = result as {network: 'bitcoin'} & BitcoinReceiveResult;
      return {
        network: 'bitcoin',
        swapId: btcResult.swapId,
        depositAddress: btcResult.depositAddress.toString(),
        bip21Uri: btcResult.bip21Uri,
        amount: {value: Number(btcResult.amount.getSat()), currency: 'SAT'},
        expiresAt: btcResult.expiresAt.toISOString(),
      };
    }
  }
}
