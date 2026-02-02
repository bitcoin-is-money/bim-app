import {
  InvalidPaymentAmountError,
  PaymentParsingError,
  type PaymentResult,
  type PreparedPayment,
  SameAddressPaymentError,
  UnsupportedNetworkError,
} from '@bim/domain/payment';
import {Hono} from 'hono';
import {z} from 'zod';
import type {AppContext} from '../../app-context';
import {createAuthMiddleware} from '../../middleware/auth.middleware';
import type {AuthenticatedHono} from '../../types';

// =============================================================================
// Validation Schemas
// =============================================================================

const ParsePaymentSchema = z.object({
  data: z.string().min(1),
});

const ExecutePaymentSchema = z.object({
  data: z.string().min(1),
});

// =============================================================================
// Routes
// =============================================================================

export function createPayRoutes(appContext: AppContext): AuthenticatedHono {
  const app: AuthenticatedHono = new Hono();

  app.use('*', createAuthMiddleware(appContext));

  const {payment: paymentService} = appContext.services;

  // ---------------------------------------------------------------------------
  // Parse + prepare payment (returns parsed data + fee)
  // ---------------------------------------------------------------------------

  app.post('/parse', async (honoCtx) => {
    try {
      const body = await honoCtx.req.json();
      const {data} = ParsePaymentSchema.parse(body);

      const prepared = paymentService.prepare(data);

      return honoCtx.json(serializePreparedPayment(prepared));
    } catch (error) {
      return handleError(honoCtx, error);
    }
  });

  // ---------------------------------------------------------------------------
  // Execute payment
  // ---------------------------------------------------------------------------

  app.post('/execute', async (honoCtx) => {
    try {
      const body = await honoCtx.req.json();
      const {data} = ExecutePaymentSchema.parse(body);

      const account = honoCtx.get('account');
      const senderAddress = account.getStarknetAddress();
      if (!senderAddress) {
        return honoCtx.json({error: 'Account not deployed'}, 400);
      }

      const result = await paymentService.execute({data, senderAddress});

      return honoCtx.json(serializePaymentResult(result));
    } catch (error) {
      return handleError(honoCtx, error);
    }
  });

  return app;
}

// =============================================================================
// Serialization
// =============================================================================

function serializeAmount(amount: import('@bim/domain/shared').Amount): {value: number; currency: string} {
  return {value: Number(amount.getSat()), currency: 'SAT'};
}

function serializePreparedPayment(prepared: PreparedPayment): Record<string, unknown> {
  const base = {
    network: prepared.network,
    amount: serializeAmount(prepared.amount),
    fee: serializeAmount(prepared.fee),
    description: prepared.description,
  };

  switch (prepared.network) {
    case 'lightning':
      return {
        ...base,
        invoice: prepared.invoice.toString(),
        ...(prepared.expiresAt && {expiresAt: prepared.expiresAt.toISOString()}),
      };
    case 'bitcoin':
      return {...base, address: prepared.address.toString()};
    case 'starknet':
      return {
        ...base,
        address: prepared.address.toString(),
        tokenAddress: prepared.tokenAddress,
      };
  }
}

function serializePaymentResult(result: PaymentResult): Record<string, unknown> {
  const base = {
    network: result.network,
    txHash: result.txHash,
    amount: serializeAmount(result.amount),
  };

  switch (result.network) {
    case 'starknet':
      return {
        ...base,
        feeAmount: serializeAmount(result.feeAmount),
        recipientAddress: result.recipientAddress.toString(),
        tokenAddress: result.tokenAddress,
      };
    case 'lightning':
      return {
        ...base,
        swapId: result.swapId,
        invoice: result.invoice.toString(),
        expiresAt: result.expiresAt.toISOString(),
      };
    case 'bitcoin':
      return {
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
