import type {Amount} from '@bim/domain/shared';
import type {PaymentResult, PreparedPaymentData} from '@bim/domain/payment';
import type {TypedResponse} from 'hono';
import {Hono} from 'hono';
import type {AppContext} from '../../../app-context';
import {type ApiErrorResponse, handleDomainError} from '../../../errors';
import type {SwapMonitor} from '../../../monitoring/swap.monitor';
import type {AuthenticatedHono} from '../../../types';
import type {
  AmountResponse,
  BuildPaymentBody,
  BuildPaymentResponse,
  ExecuteSignedPaymentBody,
  ParsePaymentBody,
  PaymentResultResponse,
  PreparedPaymentResponse,
} from './pay.types';
import {BuildPaymentSchema, ExecuteSignedPaymentSchema, ParsePaymentSchema} from './pay.types';

// =============================================================================
// Routes
// =============================================================================

export function createPayRoutes(
  appContext: AppContext,
  swapMonitor?: SwapMonitor | null,
): AuthenticatedHono {
  const log = appContext.logger.child({name: 'pay.routes.ts'});
  const app: AuthenticatedHono = new Hono();
  const {preparePayment, buildPayment, executePayment} = appContext.useCases;

  // ---------------------------------------------------------------------------
  // Parse + prepare payment (returns parsed data + fee)
  // ---------------------------------------------------------------------------

  app.post('/parse', async (honoCtx): Promise<TypedResponse<PreparedPaymentResponse | ApiErrorResponse>> => {
    try {
      const {paymentPayload}: ParsePaymentBody = ParsePaymentSchema.parse(await honoCtx.req.json());

      const prepared = await preparePayment.prepare(paymentPayload);

      const response = serializePreparedPayment(prepared, prepared.fee);
      return honoCtx.json(response) as TypedResponse<PreparedPaymentResponse>;
    } catch (error) {
      return handleDomainError(honoCtx, error, log);
    }
  });

  // ---------------------------------------------------------------------------
  // Build payment (prepare calls + AVNU build typed data)
  // ---------------------------------------------------------------------------

  app.post('/build', async (honoCtx): Promise<TypedResponse<BuildPaymentResponse | ApiErrorResponse>> => {
    try {
      const input: BuildPaymentBody = BuildPaymentSchema.parse(await honoCtx.req.json());
      const account = honoCtx.get('account');

      const result = await buildPayment.buildPayment({
        paymentPayload: input.paymentPayload,
        description: input.description,
        account,
      });

      swapMonitor?.ensureRunning();

      const response: BuildPaymentResponse = {
        buildId: result.buildId,
        messageHash: result.messageHash,
        credentialId: result.credentialId,
        payment: serializePreparedPayment(result.prepared, result.feeAmount),
      };
      return honoCtx.json(response) as TypedResponse<BuildPaymentResponse>;
    } catch (error) {
      return handleDomainError(honoCtx, error, log);
    }
  });

  // ---------------------------------------------------------------------------
  // Execute signed payment (WebAuthn assertion + cached build data)
  // ---------------------------------------------------------------------------

  app.post('/execute', async (honoCtx): Promise<TypedResponse<PaymentResultResponse | ApiErrorResponse>> => {
    try {
      const input: ExecuteSignedPaymentBody = ExecuteSignedPaymentSchema.parse(await honoCtx.req.json());
      const account = honoCtx.get('account');

      const result = await executePayment.executePayment({
        buildId: input.buildId,
        assertion: input.assertion,
        account,
      });

      return honoCtx.json<PaymentResultResponse>(serializePaymentResult(result));
    } catch (error) {
      return handleDomainError(honoCtx, error, log);
    }
  });

  return app;
}

// =============================================================================
// Serialization
// =============================================================================

function serializeAmount(amount: Amount): AmountResponse {
  return {value: Number(amount.getSat()), currency: 'SAT'};
}

function serializePreparedPayment(prepared: PreparedPaymentData, bimFee: Amount): PreparedPaymentResponse {
  const base = {
    amount: serializeAmount(prepared.amount),
    amountEditable: prepared.amountEditable,
    fee: serializeAmount(prepared.fee),
    bimFee: serializeAmount(bimFee),
    description: prepared.description,
  };

  switch (prepared.network) {
    case 'lightning': {
      const expiresAt = prepared.expiresAt?.toISOString();
      return {
        network: 'lightning',
        ...base,
        invoice: prepared.invoice.toString(),
        ...(expiresAt !== undefined && {expiresAt}),
      };
    }
    case 'bitcoin':
      return {
        network: 'bitcoin', ...base, address: prepared.address.toString(),
      };
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
