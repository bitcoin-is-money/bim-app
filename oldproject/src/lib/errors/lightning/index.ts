/**
 * @fileoverview Lightning Errors - Unified Export (Refactored)
 *
 * Centralized export for the unified Lightning Network error system.
 * The old fragmented error classes have been consolidated into a single
 * configurable error class with error codes and metadata.
 *
 * @version 2.0.0 - Unified error system
 */

// ===== NEW UNIFIED ERROR SYSTEM =====

// Main unified error class
export { UnifiedLightningError as LightningError } from './unified-error';

// Factory functions for creating errors
export { LightningErrors } from './error-factory';

// Constants and types
export { ErrorSeverity, LightningErrorCode, RecoveryAction, ERROR_STATUS_CODES } from './constants';

// Error handlers
export * from './error-handlers';

// ===== LEGACY COMPATIBILITY LAYER =====
// @deprecated - Use UnifiedLightningError and LightningErrors factory instead

// Export base error class (legacy)
export { LightningError as LegacyLightningError } from './base';

// Export specific error classes (legacy)
export * from './network-errors';
export * from './payment-errors';
export * from './pricing-errors';
export * from './service-errors';
export * from './swap-errors';
export * from './validation-errors';
export * from './webhook-errors';

// Legacy factory functions (maintain backward compatibility)
import { NetworkErrors } from './network-errors';
import { PaymentErrors } from './payment-errors';
import { PricingErrors } from './pricing-errors';
import { ServiceErrors } from './service-errors';
import { SwapErrors } from './swap-errors';
import { ValidationErrors } from './validation-errors';
import { WebhookErrors } from './webhook-errors';

/**
 * @deprecated Use the new LightningErrors factory from './error-factory' instead
 * Legacy consolidated Lightning error factory - maintains backward compatibility
 */
export const LegacyLightningErrors = {
	// Network errors
	...NetworkErrors,

	// Service errors
	...ServiceErrors,

	// Payment errors
	...PaymentErrors,

	// Swap errors
	...SwapErrors,

	// Pricing errors
	...PricingErrors,

	// Webhook errors
	...WebhookErrors,

	// Validation errors
	...ValidationErrors
};
