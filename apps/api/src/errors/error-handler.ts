import {DomainError, ErrorCode, type ErrorCode as ErrorCodeType} from '@bim/domain/shared';
import {SwapNotFoundError} from '@bim/domain/swap';
import type {Context, TypedResponse} from 'hono';
import type {Logger} from 'pino';
import {ZodError} from 'zod';
import {type ApiErrorResponse, createErrorResponse, type ErrorStatus} from './api-error';

type ApiResponse = TypedResponse<ApiErrorResponse>;

/**
 * Maps error codes to HTTP status codes.
 * Errors not listed here default to 400 (Bad Request).
 */
const HTTP_STATUS: ReadonlyMap<ErrorCodeType, ErrorStatus> = new Map([
  [ErrorCode.INTERNAL_ERROR, 500],
  [ErrorCode.ACCOUNT_NOT_FOUND, 404],
  [ErrorCode.ACCOUNT_ALREADY_EXISTS, 409],
  [ErrorCode.SWAP_NOT_FOUND, 404],
  [ErrorCode.USER_SETTINGS_NOT_FOUND, 404],
  [ErrorCode.UNAUTHORIZED, 401],
  [ErrorCode.AUTHENTICATION_FAILED, 401],
  [ErrorCode.SESSION_NOT_FOUND, 401],
  [ErrorCode.SESSION_EXPIRED, 401],
  [ErrorCode.FORBIDDEN, 403],
  [ErrorCode.ACCOUNT_DEPLOYMENT_FAILED, 500],
  [ErrorCode.SWAP_CREATION_FAILED, 500],
  [ErrorCode.EXTERNAL_SERVICE_ERROR, 502],
  [ErrorCode.PAYMASTER_SERVICE_ERROR, 502],
  [ErrorCode.TIMEOUT_ERROR, 504],
  [ErrorCode.RATE_LIMITED, 429],
]);

/**
 * Centralized error handler that maps domain errors to API responses.
 * All routes should use this function to handle errors consistently.
 */
export function handleDomainError(ctx: Context, error: unknown, logger: Logger): ApiResponse {
  if (error instanceof ZodError) {
    return handleZodError(ctx, error);
  }

  if (!(error instanceof DomainError)) {
    // Workaround: esbuild may duplicate class identities across packages,
    // breaking instanceof checks. Fall back to duck-typing on errorCode.
    const domainLike = asDomainErrorShape(error);
    if (domainLike !== undefined) {
      logger.error(error, domainLike.message);
      const status = HTTP_STATUS.get(domainLike.errorCode) ?? 400;
      return createErrorResponse(ctx, status, domainLike.errorCode, domainLike.message, domainLike.args);
    }

    logger.error(error, 'Unhandled error');
    return createErrorResponse(ctx, 500, ErrorCode.INTERNAL_ERROR, 'Internal server error');
  }

  // Swap not found is expected (e.g. polling after container restart) — warn only
  if (error instanceof SwapNotFoundError) {
    logger.warn(error, error.message);
  } else {
    logger.error(error, error.message);
  }

  const status = HTTP_STATUS.get(error.errorCode) ?? 400;
  return createErrorResponse(ctx, status, error.errorCode, error.message, error.args);
}

interface DomainErrorShape {
  errorCode: ErrorCodeType;
  message: string;
  args: Record<string, string | number> | undefined;
}

const ERROR_CODES: ReadonlySet<string> = new Set(Object.values(ErrorCode));

/**
 * Duck-type check for domain errors whose class identity was lost during
 * esbuild bundling (duplicated class → instanceof fails).
 */
function asDomainErrorShape(error: unknown): DomainErrorShape | undefined {
  if (!(error instanceof Error)) return undefined;
  const candidate = error as unknown as Record<string, unknown>;
  if (typeof candidate.errorCode !== 'string') return undefined;
  if (!ERROR_CODES.has(candidate.errorCode)) return undefined;
  const args = candidate.args;
  const validArgs = args === undefined
    || (typeof args === 'object' && args !== null && !Array.isArray(args));
  if (!validArgs) return undefined;
  return {
    errorCode: candidate.errorCode as ErrorCodeType,
    message: error.message,
    args: args as Record<string, string | number> | undefined,
  };
}

function handleZodError(ctx: Context, error: ZodError): ApiResponse {
  const firstError = error.issues[0];
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty path should show 'unknown'
  const field = firstError?.path.join('.') || 'unknown';
  return createErrorResponse(ctx, 400, ErrorCode.VALIDATION_ERROR, `Invalid ${field}: ${firstError?.message}`, {
    field,
  });
}
