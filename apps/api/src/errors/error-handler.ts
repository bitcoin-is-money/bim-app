// Domain errors - Account
import {
  AccountAlreadyExistsError,
  AccountDeploymentError,
  AccountNotFoundError,
  InvalidAccountStateError,
  InvalidStarknetAddressError,
  InvalidUsernameError,
} from '@bim/domain/account';

// Domain errors - Auth
import {
  AuthenticationFailedError,
  ChallengeAlreadyUsedError,
  ChallengeExpiredError,
  ChallengeNotFoundError,
  RegistrationFailedError,
  SessionExpiredError,
  SessionNotFoundError,
} from '@bim/domain/auth';

// Domain errors - Payment
import {
  InvalidPaymentAddressError,
  InvalidPaymentAmountError,
  MissingPaymentAmountError,
  PaymentParsingError,
  SameAddressPaymentError,
  UnsupportedNetworkError,
  UnsupportedTokenError,
} from '@bim/domain/payment';

// Domain errors - Shared
import {
  ExternalServiceError,
  InvalidStateTransitionError,
  TimeoutError,
  UnauthorizedError,
  ValidationError,
} from '@bim/domain/shared';

// Domain errors - Swap
import {
  InvalidBitcoinAddressError,
  InvalidLightningInvoiceError,
  InvalidSwapStateError,
  SwapAmountError,
  SwapClaimError,
  SwapCreationError,
  SwapExpiredError,
  SwapNotFoundError,
} from '@bim/domain/swap';

// Domain errors - User
import {UnsupportedCurrencyError, UserSettingsNotFoundError} from '@bim/domain/user';
import type {Context, TypedResponse} from 'hono';
import type {Logger} from 'pino';
import {ZodError} from 'zod';
import {type ApiErrorResponse, createErrorResponse} from './api-error';

import {ErrorCode} from './error-codes';

/**
 * Centralized error handler that maps domain errors to API responses.
 * All routes should use this function to handle errors consistently.
 */
export function handleDomainError(ctx: Context, error: unknown, logger: Logger): TypedResponse<ApiErrorResponse> {
  logger.error(error,'API error');

  // Zod validation errors
  if (error instanceof ZodError) {
    const firstError = error.issues[0];
    const field = firstError?.path.join('.') || 'unknown';
    return createErrorResponse(ctx, 400, ErrorCode.VALIDATION_ERROR, `Invalid ${field}: ${firstError?.message}`, {
      field,
    });
  }

  // --- Account errors ---
  if (error instanceof AccountNotFoundError) {
    return createErrorResponse(ctx, 404, ErrorCode.ACCOUNT_NOT_FOUND, 'Account not found');
  }
  if (error instanceof AccountAlreadyExistsError) {
    return createErrorResponse(ctx, 409, ErrorCode.ACCOUNT_ALREADY_EXISTS, 'Username already taken', {
      username: error.username,
    });
  }
  if (error instanceof InvalidUsernameError) {
    return createErrorResponse(ctx, 400, ErrorCode.INVALID_USERNAME, 'Invalid username format', {
      username: error.value,
    });
  }
  if (error instanceof InvalidAccountStateError) {
    return createErrorResponse(ctx, 400, ErrorCode.INVALID_ACCOUNT_STATE, error.message);
  }
  if (error instanceof AccountDeploymentError) {
    return createErrorResponse(ctx, 500, ErrorCode.ACCOUNT_DEPLOYMENT_FAILED, 'Account deployment failed');
  }
  if (error instanceof InvalidStarknetAddressError) {
    return createErrorResponse(ctx, 400, ErrorCode.INVALID_STARKNET_ADDRESS, 'Invalid Starknet address');
  }

  // --- Auth errors ---
  if (error instanceof ChallengeNotFoundError) {
    return createErrorResponse(ctx, 400, ErrorCode.CHALLENGE_NOT_FOUND, 'Challenge not found');
  }
  if (error instanceof ChallengeExpiredError) {
    return createErrorResponse(ctx, 400, ErrorCode.CHALLENGE_EXPIRED, 'Challenge expired');
  }
  if (error instanceof ChallengeAlreadyUsedError) {
    return createErrorResponse(ctx, 400, ErrorCode.CHALLENGE_ALREADY_USED, 'Challenge already used');
  }
  if (error instanceof AuthenticationFailedError) {
    return createErrorResponse(ctx, 401, ErrorCode.AUTHENTICATION_FAILED, 'Authentication failed');
  }
  if (error instanceof RegistrationFailedError) {
    return createErrorResponse(ctx, 400, ErrorCode.REGISTRATION_FAILED, error.message);
  }
  if (error instanceof SessionNotFoundError) {
    return createErrorResponse(ctx, 401, ErrorCode.SESSION_NOT_FOUND, 'Session not found');
  }
  if (error instanceof SessionExpiredError) {
    return createErrorResponse(ctx, 401, ErrorCode.SESSION_EXPIRED, 'Session expired');
  }

  // --- Swap errors ---
  if (error instanceof SwapNotFoundError) {
    return createErrorResponse(ctx, 404, ErrorCode.SWAP_NOT_FOUND, 'Swap not found', {
      swapId: error.swapId,
    });
  }
  if (error instanceof SwapExpiredError) {
    return createErrorResponse(ctx, 400, ErrorCode.SWAP_EXPIRED, 'Swap expired', {
      swapId: error.swapId,
    });
  }
  if (error instanceof SwapAmountError) {
    return createErrorResponse(ctx, 400, ErrorCode.SWAP_AMOUNT_OUT_OF_RANGE, error.message, {
      amount: Number(error.amount.getSat()),
      min: Number(error.min.getSat()),
      max: Number(error.max.getSat()),
    });
  }
  if (error instanceof SwapCreationError) {
    return createErrorResponse(ctx, 500, ErrorCode.SWAP_CREATION_FAILED, error.message);
  }
  if (error instanceof SwapClaimError) {
    return createErrorResponse(ctx, 500, ErrorCode.SWAP_CLAIM_FAILED, error.message, {
      swapId: error.swapId,
    });
  }
  if (error instanceof InvalidSwapStateError) {
    return createErrorResponse(ctx, 400, ErrorCode.INVALID_SWAP_STATE, error.message, {
      currentStatus: error.currentStatus,
      attemptedAction: error.attemptedAction,
    });
  }

  // --- Payment errors ---
  if (error instanceof PaymentParsingError) {
    return createErrorResponse(ctx, 400, ErrorCode.PAYMENT_PARSING_ERROR, 'Failed to parse payment data');
  }
  if (error instanceof InvalidPaymentAmountError) {
    return createErrorResponse(ctx, 400, ErrorCode.INVALID_PAYMENT_AMOUNT, error.message, {
      network: error.network,
      amount: Number(error.amount),
    });
  }
  if (error instanceof MissingPaymentAmountError) {
    return createErrorResponse(ctx, 400, ErrorCode.MISSING_PAYMENT_AMOUNT, 'Amount is required', {
      network: error.network,
    });
  }
  if (error instanceof SameAddressPaymentError) {
    return createErrorResponse(ctx, 400, ErrorCode.SAME_ADDRESS_PAYMENT, 'Cannot send to your own address');
  }
  if (error instanceof UnsupportedNetworkError) {
    return createErrorResponse(ctx, 400, ErrorCode.UNSUPPORTED_NETWORK, 'Unsupported network');
  }
  if (error instanceof UnsupportedTokenError) {
    return createErrorResponse(ctx, 400, ErrorCode.UNSUPPORTED_TOKEN, 'Unsupported token', {
      token: error.tokenAddress,
    });
  }
  if (error instanceof InvalidLightningInvoiceError) {
    return createErrorResponse(ctx, 400, ErrorCode.INVALID_LIGHTNING_INVOICE, 'Invalid Lightning invoice');
  }
  if (error instanceof InvalidBitcoinAddressError) {
    return createErrorResponse(ctx, 400, ErrorCode.INVALID_BITCOIN_ADDRESS, 'Invalid Bitcoin address');
  }
  if (error instanceof InvalidPaymentAddressError) {
    return createErrorResponse(ctx, 400, ErrorCode.INVALID_PAYMENT_ADDRESS, 'Invalid payment address');
  }

  // --- User errors ---
  if (error instanceof UserSettingsNotFoundError) {
    return createErrorResponse(ctx, 404, ErrorCode.USER_SETTINGS_NOT_FOUND, 'User settings not found');
  }
  if (error instanceof UnsupportedCurrencyError) {
    return createErrorResponse(ctx, 400, ErrorCode.UNSUPPORTED_CURRENCY, 'Unsupported currency', {
      currency: error.currency,
    });
  }

  // --- Shared errors ---
  if (error instanceof ValidationError) {
    return createErrorResponse(ctx, 400, ErrorCode.VALIDATION_ERROR, error.message, {
      field: error.field,
    });
  }
  if (error instanceof UnauthorizedError) {
    return createErrorResponse(ctx, 401, ErrorCode.UNAUTHORIZED, error.message);
  }
  if (error instanceof InvalidStateTransitionError) {
    return createErrorResponse(ctx, 400, ErrorCode.INVALID_ACCOUNT_STATE, error.message, {
      from: error.from,
      to: error.to,
    });
  }
  if (error instanceof ExternalServiceError) {
    return createErrorResponse(ctx, 502, ErrorCode.EXTERNAL_SERVICE_ERROR, 'External service error', {
      service: error.service,
    });
  }
  if (error instanceof TimeoutError) {
    return createErrorResponse(ctx, 504, ErrorCode.TIMEOUT_ERROR, 'Operation timed out', {
      operation: error.operation,
    });
  }

  // --- Fallback ---
  return createErrorResponse(ctx, 500, ErrorCode.INTERNAL_ERROR, 'Internal server error');
}
