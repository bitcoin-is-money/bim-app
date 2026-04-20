import type {BitcoinReceiveResult, ReceiveResult} from '@bim/domain/payment';
import type {TypedResponse} from 'hono';
import {Hono} from 'hono';

import type {AppContext} from '../../../app-context';
import {type ApiErrorResponse, handleDomainError} from '../../../errors';
import type {SwapMonitor} from '../../../monitoring/swap.monitor';
import type {AuthenticatedHono} from '../../../types';
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

  const {receivePayment, commitReceive} = appContext.useCases;

  // ---------------------------------------------------------------------------
  // Create receive request
  // ---------------------------------------------------------------------------

  app.post('/', async (honoCtx): Promise<TypedResponse<ReceiveResponse | ApiErrorResponse>> => {
    try {
      const input: ReceiveBody = ReceiveSchema.parse(await honoCtx.req.json());
      const account = honoCtx.get('account');

      const result = await receivePayment.receivePayment({
        network: input.network,
        amount: input.amount,
        description: input.description,
        useUriPrefix: input.useUriPrefix,
        account,
      });

      // Bitcoin pending commit — return build data for WebAuthn signing
      if ('buildId' in result) {
        const response: BitcoinReceivePendingCommitResponse = {
          network: 'bitcoin',
          status: 'pending_commit',
          buildId: result.buildId,
          messageHash: result.messageHash,
          credentialId: result.credentialId,
          swapId: result.swapId,
          amount: {value: Number(BigInt(result.amountSats)), currency: 'SAT'},
          expiresAt: result.expiresAt.toISOString(),
        };
        return honoCtx.json<BitcoinReceivePendingCommitResponse>(response);
      }

      swapMonitor?.ensureRunning();
      return honoCtx.json<ReceiveResponse>(serializeReceiveResult(result));
    } catch (error) {
      return handleDomainError(honoCtx, error, log);
    }
  });

  // ---------------------------------------------------------------------------
  // Commit Bitcoin receive (phase 2)
  // ---------------------------------------------------------------------------

  app.post('/commit', async (honoCtx): Promise<TypedResponse<BitcoinReceiveCommitResponse | ApiErrorResponse>> => {
    try {
      const input: ReceiveCommitBody = ReceiveCommitSchema.parse(await honoCtx.req.json());
      const account = honoCtx.get('account');

      const result = await commitReceive.commitReceive({
        buildId: input.buildId,
        assertion: input.assertion,
        account,
      });

      swapMonitor?.ensureRunning();
      return honoCtx.json<BitcoinReceiveCommitResponse>({
        network: 'bitcoin',
        swapId: result.swapId,
        depositAddress: result.depositAddress.toString(),
        bip21Uri: result.bip21Uri,
        amount: {value: Number(result.amount.getSat()), currency: 'SAT'},
        expiresAt: result.expiresAt.toISOString(),
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
