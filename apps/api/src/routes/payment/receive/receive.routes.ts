import type {BitcoinReceiveResult, ReceiveResult} from '@bim/domain/payment';
import type {StarknetCall} from '@bim/domain/ports';
import {Amount, InsufficientBalanceError} from '@bim/domain/shared';
import type {TypedResponse} from 'hono';
import {Hono} from 'hono';
import {randomUUID} from 'node:crypto';

import {WebAuthnSignatureProcessor} from '../../../adapters';
import type {AppContext} from '../../../app-context';
import {type ApiErrorResponse, createErrorResponse, ErrorCode, handleDomainError} from '../../../errors';
import type {AuthenticatedHono} from '../../../types';
import {ReceiveBuildCache} from './receive-build.cache';
import {ReceiveCommitSchema, ReceiveSchema} from './receive.schemas';
import type {BitcoinReceiveCommitResponse, BitcoinReceivePendingCommitResponse, ReceiveResponse} from './receive.types';

// =============================================================================
// Routes
// =============================================================================

export function createReceiveRoutes(appContext: AppContext): AuthenticatedHono {
  const log = appContext.logger.child({name: 'receive.routes.ts'});
  const app: AuthenticatedHono = new Hono();

  const {receive: receiveService} = appContext.services;
  const buildCache = new ReceiveBuildCache();
  const signatureProcessor = new WebAuthnSignatureProcessor({
    origin: appContext.webauthn.origin,
    rpId: appContext.webauthn.rpId,
  });

  // ---------------------------------------------------------------------------
  // Create receive request
  // For Lightning/Starknet: returns data immediately.
  // For Bitcoin: returns commit data for WebAuthn signing (two-phase flow).
  // ---------------------------------------------------------------------------

  app.post('/', async (honoCtx): Promise<TypedResponse<ReceiveResponse | ApiErrorResponse>> => {
    try {
      const body = await honoCtx.req.json();
      const input = ReceiveSchema.parse(body);

      const account = honoCtx.get('account');
      const starknetAddress = account.getStarknetAddress();
      if (!starknetAddress) {
        return createErrorResponse(honoCtx, 400, ErrorCode.ACCOUNT_NOT_DEPLOYED, 'Account not deployed');
      }

      const amount = input.amount
        ? Amount.ofSatoshi(BigInt(input.amount))
        : undefined;
      const tokenAddress = input.tokenAddress;
      const description = input.description || 'Received';

      const result = await receiveService.receive({
        network: input.network,
        destinationAddress: starknetAddress,
        ...(amount !== undefined && {amount}),
        ...(tokenAddress !== undefined && {tokenAddress}),
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
          const deficit = approveInfo.amount - strkBalance;

          if (deficit > 0n) {
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
            throw new InsufficientBalanceError(approveInfo.amount, approveInfo.tokenAddress);
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
      const body = await honoCtx.req.json();
      const input = ReceiveCommitSchema.parse(body);

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

      // 6. Complete the swap (SDK detects on-chain commit, returns deposit address)
      const starknetAddress = account.getStarknetAddress()!;
      const completeResult = await receiveService.completeBitcoinReceive({
        swapId: build.swapId,
        destinationAddress: starknetAddress,
        amount: build.amount,
        description: build.description,
        accountId: build.accountId,
        useUriPrefix: build.useUriPrefix,
      });

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
function extractApproveAmount(calls: readonly StarknetCall[]): {amount: bigint; tokenAddress: string} | undefined {
  const approveCall = calls.find(c => c.entrypoint === 'approve');
  if (!approveCall || approveCall.calldata.length < 3) return undefined;
  try {
    const low = BigInt(approveCall.calldata[1]!);
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
