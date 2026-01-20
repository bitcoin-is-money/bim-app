/**
 * @fileoverview Transaction Completion Utilities
 *
 * This module provides utilities for handling post-transaction actions,
 * including triggering blockchain scanning after successful transactions.
 *
 * Key Features:
 * - Trigger immediate blockchain scanning after transaction completion
 * - Support for delayed scanning to allow blockchain finalization
 * - Proper error handling and logging
 * - Non-blocking async execution
 *
 * @author bim
 * @version 1.0.0
 */

import { getBlockchainScannerService } from '$lib/services/server/blockchain-scanner.service';
import { logger } from '$lib/utils/logger';

/**
 * Transaction completion context
 */
export interface TransactionCompletionContext {
	/** Transaction hash */
	transactionHash: string;
	/** Transaction type for logging */
	transactionType: 'payment' | 'lightning-to-starknet' | 'starknet-to-lightning';
	/** User address involved in the transaction */
	userAddress?: string;
	/** Swap ID if applicable */
	swapId?: string;
	/** Additional metadata */
	metadata?: Record<string, any>;
}

/**
 * Options for triggering blockchain scanning
 */
export interface ScanTriggerOptions {
	/** Delay in milliseconds before triggering scan (default: 5000ms) */
	delay?: number;
	/** Whether to force scan even if already running (default: false) */
	force?: boolean;
	/** Maximum number of retry attempts if scan fails (default: 2) */
	maxRetries?: number;
}

/**
 * Result of scan trigger attempt
 */
export interface ScanTriggerResult {
	/** Whether the scan was successfully triggered */
	triggered: boolean;
	/** Delay applied before triggering */
	delayApplied: number;
	/** Any error that occurred */
	error?: string;
	/** Additional context */
	context: TransactionCompletionContext;
}

/**
 * Sleep utility function
 */
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Trigger blockchain scanning after transaction completion
 *
 * This function triggers an immediate blockchain scan after a successful transaction
 * to ensure users see their transactions quickly without waiting for the next
 * scheduled scan cycle.
 *
 * @param context - Transaction completion context
 * @param options - Scan trigger options
 * @returns Promise resolving to scan trigger result
 */
export async function triggerPostTransactionScan(
	context: TransactionCompletionContext,
	options: ScanTriggerOptions = {}
): Promise<ScanTriggerResult> {
	const {
		delay = 10000, // 10 second default delay
		force = false,
		maxRetries = 2
	} = options;

	const result: ScanTriggerResult = {
		triggered: false,
		delayApplied: delay,
		context
	};

	try {
		logger.info(`Triggering post-transaction blockchain scan`, {
			transactionHash: context.transactionHash,
			transactionType: context.transactionType,
			userAddress: context.userAddress,
			swapId: context.swapId,
			delay,
			metadata: context.metadata
		});

		// Apply delay to allow blockchain to finalize the transaction
		if (delay > 0) {
			logger.debug(`Waiting ${delay}ms before triggering blockchain scan`);
			await sleep(delay);
		}

		// Attempt to trigger scanning with retries
		let lastError: Error | null = null;

		for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
			try {
				// Check if scanner is already running (unless force is enabled)
				if (!force) {
					const scannerStatus = getBlockchainScannerService().getStatus();
					if (scannerStatus.isScanning) {
						logger.info(`Blockchain scanner already running, skipping triggered scan`, {
							transactionHash: context.transactionHash,
							attempt
						});
						result.triggered = false;
						result.error = 'Scanner already running';
						return result;
					}
				}

				// Trigger the scan
				await getBlockchainScannerService().startScanning();

				result.triggered = true;
				logger.info(`Successfully triggered blockchain scan after transaction completion`, {
					transactionHash: context.transactionHash,
					transactionType: context.transactionType,
					attempt,
					delayApplied: delay
				});

				return result;
			} catch (error) {
				lastError = error as Error;
				logger.warn(
					`Failed to trigger blockchain scan (attempt ${attempt}/${maxRetries + 1})`,
					lastError instanceof Error ? lastError : undefined,
					{
						transactionHash: context.transactionHash,
						attempt
					}
				);

				// Wait before retry (except on last attempt)
				if (attempt <= maxRetries) {
					await sleep(1000 * attempt); // Exponential backoff
				}
			}
		}

		// All attempts failed
		result.error = lastError?.message || 'Unknown error';
		logger.error(
			`Failed to trigger blockchain scan after ${maxRetries + 1} attempts`,
			lastError,
			{
				transactionHash: context.transactionHash,
				transactionType: context.transactionType
			}
		);
	} catch (error) {
		result.error = (error as Error).message;
		logger.error(
			`Unexpected error in triggerPostTransactionScan`,
			error instanceof Error ? error : undefined,
			{
				transactionHash: context.transactionHash
			}
		);
	}

	return result;
}

/**
 * Convenience function for triggering scan after payment transaction
 */
export async function triggerScanAfterPayment(
	transactionHash: string,
	userAddress?: string,
	metadata?: Record<string, any>
): Promise<ScanTriggerResult> {
	return triggerPostTransactionScan({
		transactionHash,
		transactionType: 'payment',
		userAddress,
		metadata
	});
}

/**
 * Convenience function for triggering scan after Lightning to Starknet swap
 */
export async function triggerScanAfterLightningSwap(
	transactionHash: string,
	swapId: string,
	userAddress?: string,
	metadata?: Record<string, any>
): Promise<ScanTriggerResult> {
	return triggerPostTransactionScan({
		transactionHash,
		transactionType: 'lightning-to-starknet',
		swapId,
		userAddress,
		metadata
	});
}

/**
 * Convenience function for triggering scan after Starknet to Lightning swap
 */
export async function triggerScanAfterStarknetSwap(
	transactionHash: string,
	swapId: string,
	userAddress?: string,
	metadata?: Record<string, any>
): Promise<ScanTriggerResult> {
	return triggerPostTransactionScan({
		transactionHash,
		transactionType: 'starknet-to-lightning',
		swapId,
		userAddress,
		metadata
	});
}

/**
 * Background (fire-and-forget) version of scan triggering
 *
 * This function triggers scanning in the background without waiting for completion,
 * making it suitable for use in API endpoints where you don't want to delay
 * the response to the user.
 */
export function triggerPostTransactionScanBackground(
	context: TransactionCompletionContext,
	options: ScanTriggerOptions = {}
): void {
	// Fire and forget - don't await the result
	triggerPostTransactionScan(context, options).catch((error) => {
		logger.error(
			`Background scan trigger failed`,
			error instanceof Error ? error : undefined,
			{
				transactionHash: context.transactionHash
			}
		);
	});

	logger.debug(`Background blockchain scan trigger initiated`, {
		transactionHash: context.transactionHash,
		transactionType: context.transactionType
	});
}
