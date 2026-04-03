import type {PaymentResult, PreparedCalls, PreparedPaymentData} from '@bim/domain/payment';
import type {Amount} from '@bim/domain/shared';
import type {TypedResponse} from 'hono';
import {Hono} from 'hono';
import {randomUUID} from 'node:crypto';
import {WebAuthnSignatureProcessor} from '../../../adapters';
import type {AppContext} from '../../../app-context';
import {type ApiErrorResponse, createErrorResponse, ErrorCode, handleDomainError} from '../../../errors';
import type {SwapMonitor} from '../../../monitoring/swap.monitor';
import type {AuthenticatedHono} from '../../../types';
import {PaymentBuildCache} from './payment-build.cache';
import {BuildPaymentSchema, ExecuteSignedPaymentSchema, ParsePaymentSchema} from './pay.types';
import type {
  AmountResponse,
  BuildPaymentBody,
  BuildPaymentResponse,
  ExecuteSignedPaymentBody,
  ParsePaymentBody,
  PaymentResultResponse,
  PreparedPaymentResponse,
} from './pay.types';

// =============================================================================
// Routes
// =============================================================================

export function createPayRoutes(
  appContext: AppContext,
  swapMonitor?: SwapMonitor | null,
): AuthenticatedHono {
  const log = appContext.logger.child({name: 'pay.routes.ts'});
  const app: AuthenticatedHono = new Hono();
  const { payService, parseService } = appContext.services;
  const buildCache = new PaymentBuildCache();
  const signatureProcessor = new WebAuthnSignatureProcessor({
    origin: appContext.webauthn.origin,
    rpId: appContext.webauthn.rpId,
  }, log);

  // ---------------------------------------------------------------------------
  // Parse + prepare payment (returns parsed data + fee)
  // ---------------------------------------------------------------------------

  app.post('/parse', async (honoCtx): Promise<TypedResponse<PreparedPaymentResponse | ApiErrorResponse>> => {
    try {
      const {paymentPayload}: ParsePaymentBody = ParsePaymentSchema.parse(await honoCtx.req.json());

      const prepared = await payService.prepare(paymentPayload);

      // At this step, prepared.fee = bimFee (before LP adjustment)
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
      const senderAddress = account.getStarknetAddress();
      if (!senderAddress) {
        return createErrorResponse(honoCtx, 400, ErrorCode.ACCOUNT_NOT_DEPLOYED, 'Account not deployed');
      }

      // 1. Parse once — single source of truth for destination, amount, etc.
      const parsed = parseService.parse(input.paymentPayload);
      const prepared = await payService.prepare(parsed);

      // 2. Prepare calls using already-parsed data
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty description should fallback
      const description = input.description || parsed.description || 'Sent';
      const preparedCalls = await payService.prepareCalls(parsed, senderAddress, account.id, description);
      swapMonitor?.ensureRunning();

      // 3. Build typed data via AVNU paymaster
      const {typedData, messageHash} = await appContext.gateways.starknet.buildCalls({
        senderAddress,
        calls: preparedCalls.calls,
      });

      // 4. Cache for execute step
      const buildId = randomUUID();
      buildCache.set(buildId, {
        preparedCalls,
        typedData,
        senderAddress,
        accountId: account.id,
        description,
        createdAt: Date.now(),
      });

      // 5. For swap networks, use the real LP-quoted fee instead of the estimated percentage,
      // plus the BIM fee (collected via a separate on-chain call).
      if (preparedCalls.network === 'lightning' || preparedCalls.network === 'bitcoin') {
        const lpFee = preparedCalls.amount.subtract(prepared.amount);
        prepared.fee = lpFee.add(preparedCalls.feeAmount);
      }

      const response: BuildPaymentResponse = {
        buildId,
        messageHash,
        credentialId: account.credentialId,
        payment: serializePreparedPayment(prepared, preparedCalls.feeAmount),
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

      // 4. Execute via AVNU paymaster
      const {txHash} = await appContext.gateways.starknet.executeSignedCalls({
        senderAddress: build.senderAddress,
        typedData: build.typedData,
        signature,
      });

      // 5. Save description for the sender's transaction
      await payService.savePaymentResult({
        txHash,
        accountId: build.accountId,
        description: build.description,
      });

      // Also save description for recipient (if Starknet transfer to a BIM user)
      if (build.preparedCalls.network === 'starknet') {
        const recipientAccount = await appContext.repositories.account.findByStarknetAddress(
          build.preparedCalls.recipientAddress,
        );
        if (recipientAccount) {
          await payService.savePaymentResult({
            txHash,
            accountId: recipientAccount.id,
            description: build.description,
          });
        }
      }

      // 7. Build response from cached prepared calls
      const result = buildPaymentResult(txHash, build.preparedCalls);

      return honoCtx.json<PaymentResultResponse>(serializePaymentResult(result));
    } catch (error) {
      return handleDomainError(honoCtx, error, log);
    }
  });

  return app;
}

// =============================================================================
// Helpers
// =============================================================================

function buildPaymentResult(txHash: string, preparedCalls: PreparedCalls): PaymentResult {
  switch (preparedCalls.network) {
    case 'starknet':
      return {
        network: 'starknet',
        txHash,
        amount: preparedCalls.amount,
        feeAmount: preparedCalls.feeAmount,
        recipientAddress: preparedCalls.recipientAddress,
        tokenAddress: preparedCalls.tokenAddress,
      };
    case 'lightning':
      return {
        network: 'lightning',
        txHash,
        amount: preparedCalls.amount,
        swapId: preparedCalls.swapId,
        invoice: preparedCalls.invoice,
        expiresAt: preparedCalls.expiresAt,
      };
    case 'bitcoin':
      return {
        network: 'bitcoin',
        txHash,
        amount: preparedCalls.amount,
        swapId: preparedCalls.swapId,
        destinationAddress: preparedCalls.destinationAddress,
        expiresAt: preparedCalls.expiresAt,
      };
  }
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
