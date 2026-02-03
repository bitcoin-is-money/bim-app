import {
  InvalidPaymentAmountError,
  type ReceiveResult,
} from '@bim/domain/payment';
import {Amount} from '@bim/domain/shared';
import {SwapAmountError, SwapCreationError} from '@bim/domain/swap';
import {Hono} from 'hono';
import type {TypedResponse} from 'hono';
import {z} from 'zod';
import type {AppContext} from '../../../app-context';
import type {AuthenticatedHono} from '../../../types';
import {ReceiveSchema} from './receive.schemas';
import type {ReceiveResponse} from './receive.types';

// =============================================================================
// Routes
// =============================================================================

export function createReceiveRoutes(appContext: AppContext): AuthenticatedHono {
  const app: AuthenticatedHono = new Hono();

  const {receive: receiveService} = appContext.services;

  // ---------------------------------------------------------------------------
  // Create receive request
  // ---------------------------------------------------------------------------

  app.post('/', async (honoCtx): Promise<TypedResponse<ReceiveResponse> | Response> => {
    try {
      const body = await honoCtx.req.json();
      const input = ReceiveSchema.parse(body);

      const account = honoCtx.get('account');
      const starknetAddress = account.getStarknetAddress();
      if (!starknetAddress) {
        return honoCtx.json({error: 'Account not deployed'}, 400);
      }

      const amount = input.amount ? Amount.ofSatoshi(BigInt(input.amount)) : undefined;

      const result = await receiveService.receive({
        network: input.network,
        destinationAddress: starknetAddress,
        amount,
        tokenAddress: input.tokenAddress,
      });

      return honoCtx.json<ReceiveResponse>(serializeReceiveResult(result));
    } catch (error) {
      return handleError(honoCtx, error);
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
    case 'bitcoin':
      return {
        network: 'bitcoin',
        swapId: result.swapId,
        depositAddress: result.depositAddress.toString(),
        bip21Uri: result.bip21Uri,
        amount: {value: Number(result.amount.getSat()), currency: 'SAT'},
        expiresAt: result.expiresAt.toISOString(),
      };
  }
}

// =============================================================================
// Error Handling
// =============================================================================

function handleError(honoCtx: {json: (data: unknown, status: number) => Response}, error: unknown): Response {
  if (error instanceof z.ZodError) {
    return honoCtx.json({error: 'Validation error', details: error.errors}, 400);
  }

  if (error instanceof InvalidPaymentAmountError) {
    return honoCtx.json({error: error.message}, 400);
  }

  if (error instanceof SwapAmountError) {
    return honoCtx.json({
      error: 'Amount out of range',
      min: error.min.toSatString(),
      max: error.max.toSatString(),
    }, 400);
  }

  if (error instanceof SwapCreationError) {
    return honoCtx.json({error: error.message}, 400);
  }

  console.error('Receive error:', error);
  return honoCtx.json({error: 'Internal server error'}, 500);
}
