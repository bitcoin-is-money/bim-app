import type {ErrorCode} from '@bim/domain/shared';
import type {Context, TypedResponse} from 'hono';

/**
 * API error body structure.
 * - code: Error code for i18n lookup
 * - message: Fallback English message (for dev/debug)
 * - args: Optional interpolation arguments for i18n
 */
export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  args?: Record<string, string | number>;
}

/**
 * Standardized API error response format.
 */
export interface ApiErrorResponse {
  error: ApiErrorBody;
}

export type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 429 | 500 | 502 | 503 | 504;

/**
 * Create a typed error response.
 */
export function createErrorResponse(
  ctx: Context,
  status: ErrorStatus,
  code: ErrorCode,
  message: string,
  args?: Record<string, string | number>,
): TypedResponse<ApiErrorResponse> {
  const error: ApiErrorBody = args
    ? {code, message, args}
    : {code, message};
  return ctx.json({error} satisfies ApiErrorResponse, status) as TypedResponse<ApiErrorResponse>;
}
