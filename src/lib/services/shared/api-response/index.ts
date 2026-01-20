/**
 * @fileoverview API Response Module - Main Export
 *
 * Centralized export for all API response utilities and types.
 * Provides both the new modular utilities and backward compatibility.
 */

// Export types
export * from './types';

// Export error codes and mappings
export * from './error-codes';

// Export response formatters
export * from './response-formatter';

// Export error handling utilities
export * from './error-handler';

// Export validation utilities
export * from './validators';

// Re-export for backward compatibility
export { handleApiError, withErrorHandling } from './error-handler';
export { createErrorResponse, createSuccessResponse } from './response-formatter';
export { validateRequestBody, validateQueryParams, validators } from './validators';
export { ApiErrorCode, ERROR_STATUS_MAP, getStatusCode } from './error-codes';
