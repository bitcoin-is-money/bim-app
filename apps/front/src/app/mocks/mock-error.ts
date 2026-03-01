import {HttpResponse} from '@angular/common/http';
import type {ApiErrorResponse, ErrorCode} from '../model';

/**
 * Create a mock HTTP error response with the standard API error format.
 */
export function createErrorResponse(
  status: number,
  code: ErrorCode,
  message: string
): HttpResponse<ApiErrorResponse> {
  return new HttpResponse({
    status,
    body: {error: {code, message}},
  });
}
