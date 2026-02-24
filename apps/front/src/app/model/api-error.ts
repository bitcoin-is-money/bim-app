/**
 * API Error codes - mirrors backend ErrorCode.
 * Used for i18n lookup on the frontend.
 */
export const ErrorCode = {
  // Generic
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',

  // Auth
  ACCOUNT_NOT_FOUND: 'ACCOUNT_NOT_FOUND',
  ACCOUNT_ALREADY_EXISTS: 'ACCOUNT_ALREADY_EXISTS',
  INVALID_USERNAME: 'INVALID_USERNAME',
  CHALLENGE_NOT_FOUND: 'CHALLENGE_NOT_FOUND',
  CHALLENGE_EXPIRED: 'CHALLENGE_EXPIRED',
  CHALLENGE_ALREADY_USED: 'CHALLENGE_ALREADY_USED',
  INVALID_CHALLENGE: 'INVALID_CHALLENGE',
  AUTHENTICATION_FAILED: 'AUTHENTICATION_FAILED',
  REGISTRATION_FAILED: 'REGISTRATION_FAILED',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  SESSION_EXPIRED: 'SESSION_EXPIRED',

  // Account
  ACCOUNT_NOT_DEPLOYED: 'ACCOUNT_NOT_DEPLOYED',
  INVALID_ACCOUNT_STATE: 'INVALID_ACCOUNT_STATE',
  ACCOUNT_DEPLOYMENT_FAILED: 'ACCOUNT_DEPLOYMENT_FAILED',
  INVALID_STARKNET_ADDRESS: 'INVALID_STARKNET_ADDRESS',

  // Swap
  SWAP_NOT_FOUND: 'SWAP_NOT_FOUND',
  SWAP_EXPIRED: 'SWAP_EXPIRED',
  SWAP_AMOUNT_OUT_OF_RANGE: 'SWAP_AMOUNT_OUT_OF_RANGE',
  SWAP_CREATION_FAILED: 'SWAP_CREATION_FAILED',
  SWAP_CLAIM_FAILED: 'SWAP_CLAIM_FAILED',
  INVALID_SWAP_STATE: 'INVALID_SWAP_STATE',

  // Payment
  PAYMENT_PARSING_ERROR: 'PAYMENT_PARSING_ERROR',
  INVALID_PAYMENT_AMOUNT: 'INVALID_PAYMENT_AMOUNT',
  MISSING_PAYMENT_AMOUNT: 'MISSING_PAYMENT_AMOUNT',
  SAME_ADDRESS_PAYMENT: 'SAME_ADDRESS_PAYMENT',
  UNSUPPORTED_NETWORK: 'UNSUPPORTED_NETWORK',
  UNSUPPORTED_TOKEN: 'UNSUPPORTED_TOKEN',
  INVALID_LIGHTNING_INVOICE: 'INVALID_LIGHTNING_INVOICE',
  INVALID_BITCOIN_ADDRESS: 'INVALID_BITCOIN_ADDRESS',
  INVALID_PAYMENT_ADDRESS: 'INVALID_PAYMENT_ADDRESS',

  // Balance
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  INSUFFICIENT_BALANCE_WITH_AMOUNT: 'INSUFFICIENT_BALANCE_WITH_AMOUNT',

  // User
  USER_SETTINGS_NOT_FOUND: 'USER_SETTINGS_NOT_FOUND',
  UNSUPPORTED_CURRENCY: 'UNSUPPORTED_CURRENCY',

  // External services
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * API error body structure from the backend.
 */
export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  args?: Record<string, string | number>;
}

/**
 * API error response structure from the backend.
 */
export interface ApiErrorResponse {
  error: ApiErrorBody;
}

/**
 * Check if an object is an API error response.
 */
export function isApiErrorResponse(obj: unknown): obj is ApiErrorResponse {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'error' in obj &&
    typeof (obj as ApiErrorResponse).error === 'object' &&
    (obj as ApiErrorResponse).error !== null &&
    'code' in (obj as ApiErrorResponse).error &&
    'message' in (obj as ApiErrorResponse).error
  );
}

/**
 * Extract error message from API error response or fallback to default.
 */
export function getErrorMessage(error: unknown, fallback = 'An error occurred'): string {
  if (isApiErrorResponse(error)) {
    return error.error.message;
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as {message: unknown}).message);
  }
  return fallback;
}

/**
 * Extract error code from API error response.
 */
export function getErrorCode(error: unknown): ErrorCode | undefined {
  if (isApiErrorResponse(error)) {
    return error.error.code;
  }
  return undefined;
}
