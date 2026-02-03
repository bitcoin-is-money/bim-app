import {
  InvalidPaymentAmountError,
  PaymentParsingError,
  type PaymentResult,
  type PreparedPayment,
  SameAddressPaymentError,
  UnsupportedNetworkError,
} from '@bim/domain/payment';
import {Hono} from 'hono';
import type {TypedResponse} from 'hono';
import {z} from 'zod';
import type {AppContext} from '../../../app-context';
import type {AuthenticatedHono} from '../../../types';
import {ExecutePaymentSchema, ParsePaymentSchema} from './pay.schemas';
import type {AmountResponse, PaymentResultResponse, PreparedPaymentResponse} from './pay.types';

// =============================================================================
// Routes
// =============================================================================

export function createPayRoutes(appContext: AppContext): AuthenticatedHono {
  const app: AuthenticatedHono = new Hono();

  const {pay: payService} = appContext.services;

  // ---------------------------------------------------------------------------
  // Parse + prepare payment (returns parsed data + fee)
  // ---------------------------------------------------------------------------

  app.post('/parse', async (honoCtx): Promise<TypedResponse<PreparedPaymentResponse> | Response> => {
    try {
      const body = await honoCtx.req.json();
      const {data} = ParsePaymentSchema.parse(body);

      const prepared = payService.prepare(data);

      return honoCtx.json<PreparedPaymentResponse>(serializePreparedPayment(prepared));
    } catch (error) {
      return handleError(honoCtx, error);
    }
  });

  // ---------------------------------------------------------------------------
  // Execute payment
  // ---------------------------------------------------------------------------

  app.post('/execute', async (honoCtx): Promise<TypedResponse<PaymentResultResponse> | Response> => {
    try {
      const body = await honoCtx.req.json();
      const {data} = ExecutePaymentSchema.parse(body);

      const account = honoCtx.get('account');
      const senderAddress = account.getStarknetAddress();
      if (!senderAddress) {
        return honoCtx.json({error: 'Account not deployed'}, 400);
      }

      const result = await payService.execute({data, senderAddress});

      return honoCtx.json<PaymentResultResponse>(serializePaymentResult(result));
    } catch (error) {
      return handleError(honoCtx, error);
    }
  });

  return app;
}

// =============================================================================
// Serialization
// =============================================================================

function serializeAmount(amount: import('@bim/domain/shared').Amount): AmountResponse {
  return {value: Number(amount.getSat()), currency: 'SAT'};
}

function serializePreparedPayment(prepared: PreparedPayment): PreparedPaymentResponse {
  const base = {
    amount: serializeAmount(prepared.amount),
    fee: serializeAmount(prepared.fee),
    description: prepared.description,
  };

  switch (prepared.network) {
    case 'lightning':
      return {
        network: 'lightning',
        ...base,
        invoice: prepared.invoice.toString(),
        expiresAt: prepared.expiresAt?.toISOString(),
      };
    case 'bitcoin':
      return {network: 'bitcoin', ...base, address: prepared.address.toString()};
    case 'starknet':
      return {
        network: 'starknet',
        ...base,
        address: prepared.address.toString(),
        tokenAddress: prepared.tokenAddress,
      };
  }
}

function serializePaymentResult(result: PaymentResult): PaymentResultResponse {
  const base = {
    txHash: result.txHash,
    amount: serializeAmount(result.amount),
  };

  switch (result.network) {
    case 'starknet':
      return {
        network: 'starknet',
        ...base,
        feeAmount: serializeAmount(result.feeAmount),
        recipientAddress: result.recipientAddress.toString(),
        tokenAddress: result.tokenAddress,
      };
    case 'lightning':
      return {
        network: 'lightning',
        ...base,
        swapId: result.swapId,
        invoice: result.invoice.toString(),
        expiresAt: result.expiresAt.toISOString(),
      };
    case 'bitcoin':
      return {
        network: 'bitcoin',
        ...base,
        swapId: result.swapId,
        destinationAddress: result.destinationAddress.toString(),
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

  if (error instanceof UnsupportedNetworkError) {
    return honoCtx.json({error: error.message}, 400);
  }

  if (error instanceof PaymentParsingError) {
    return honoCtx.json({error: error.message}, 400);
  }

  if (error instanceof InvalidPaymentAmountError) {
    return honoCtx.json({error: error.message}, 400);
  }

  if (error instanceof SameAddressPaymentError) {
    return honoCtx.json({error: error.message}, 400);
  }

  console.error('Payment error:', error);
  return honoCtx.json({error: 'Internal server error'}, 500);
}
