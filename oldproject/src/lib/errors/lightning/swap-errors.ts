/**
 * @fileoverview Lightning Swap Operation Errors
 *
 * Error classes and factory functions for swap-related failures.
 */

import { LightningError } from './base';
import { ErrorSeverity, LightningErrorCode, RecoveryAction } from './constants';

/**
 * Swap operation errors
 */
export class LightningSwapError extends LightningError {
	constructor(
		code: LightningErrorCode,
		message: string,
		userMessage: string,
		severity: ErrorSeverity = ErrorSeverity.HIGH,
		recoveryActions: RecoveryAction[] = [RecoveryAction.RETRY],
		context: Record<string, any> = {}
	) {
		super(code, message, userMessage, severity, recoveryActions, context);
	}
}

/**
 * Factory functions for swap errors
 */
export const SwapErrors = {
	swapFailed: (swapId: string, reason?: string) =>
		new LightningSwapError(
			LightningErrorCode.SWAP_FAILED,
			`Lightning swap failed: ${swapId} - ${reason || 'Unknown error'}`,
			'Your Bitcoin to Starknet swap could not be completed. Please try again.',
			ErrorSeverity.HIGH,
			[RecoveryAction.RETRY, RecoveryAction.CONTACT_SUPPORT],
			{ swapId, reason }
		),

	swapTimeout: (swapId: string, timeoutMs: number) =>
		new LightningSwapError(
			LightningErrorCode.SWAP_TIMEOUT,
			`Swap timeout: ${swapId} after ${timeoutMs}ms`,
			'The swap is taking longer than expected. Please wait or try again.',
			ErrorSeverity.MEDIUM,
			[RecoveryAction.WAIT_AND_RETRY],
			{ swapId, timeoutMs }
		),

	swapCancelled: (swapId: string) =>
		new LightningSwapError(
			LightningErrorCode.SWAP_CANCELLED,
			`Swap cancelled: ${swapId}`,
			'The swap was cancelled. You can create a new swap if needed.',
			ErrorSeverity.LOW,
			[RecoveryAction.RETRY],
			{ swapId }
		),

	swapExpired: (swapId: string) =>
		new LightningSwapError(
			LightningErrorCode.SWAP_EXPIRED,
			`Swap expired: ${swapId}`,
			'The swap has expired. Please create a new swap.',
			ErrorSeverity.MEDIUM,
			[RecoveryAction.RETRY],
			{ swapId }
		),

	slippageExceeded: (swapId: string, slippage: number) =>
		new LightningSwapError(
			LightningErrorCode.SWAP_SLIPPAGE_EXCEEDED,
			`Swap slippage exceeded: ${swapId} - ${slippage}%`,
			'Price changed too much during the swap. Please try again.',
			ErrorSeverity.MEDIUM,
			[RecoveryAction.RETRY],
			{ swapId, slippage }
		),

	insufficientLiquidity: (asset: string) =>
		new LightningSwapError(
			LightningErrorCode.SWAP_FAILED,
			`Insufficient liquidity for ${asset}`,
			`Not enough liquidity available for ${asset} swaps. Please try again later or choose a different amount.`,
			ErrorSeverity.HIGH,
			[RecoveryAction.TRY_DIFFERENT_ASSET, RecoveryAction.REDUCE_AMOUNT],
			{ asset }
		)
};
