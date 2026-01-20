/**
 * @fileoverview Error Handling Utilities for Atomiq Service
 *
 * This file contains error mapping, validation, and handling utilities
 * for the Atomiq cross-chain swap services.
 *
 * @author bim
 * @version 1.0.0
 */

import {
	ErrorSeverity,
	LightningErrorCode,
	LightningErrors,
	LightningServiceError,
	LightningSwapError
} from '$lib/errors/lightning';
import { logger } from '$lib/utils/logger';
import type {
	BitcoinSwapRequest,
	LightningSwapRequest,
	StarknetToLightningSwapRequest
} from './types';

/**
 * Maps SDK errors to Lightning errors for Lightning-to-Starknet swaps
 */
export function handleLightningSwapError(
	error: unknown,
	request: LightningSwapRequest,
	context: { swapId?: string; phase?: string } = {}
): never {
	logger.error('Lightning swap error occurred', error as Error, {
		swapId: context.swapId,
		phase: context.phase,
		request: {
			amountSats: request.amountSats,
			destinationAsset: request.destinationAsset,
			starknetAddress: request.starknetAddress?.slice(0, 10) + '...'
		}
	});

	if (error instanceof Error) {
		// Handle specific SDK error patterns
		if (error.message.includes('insufficient liquidity')) {
			throw LightningErrors.insufficientLiquidity(request.destinationAsset);
		}

		if (error.message.includes('amount too small') || error.message.includes('minimum amount')) {
			throw new LightningSwapError(
				LightningErrorCode.INVALID_AMOUNT,
				'Amount below minimum threshold',
				`The requested amount of ${request.amountSats} satoshis is below the minimum required for ${request.destinationAsset} swaps.`,
				ErrorSeverity.MEDIUM,
				['Check the minimum swap amounts', 'Try with a larger amount'],
				{ originalError: error, minimumAmount: 1000 } // Example minimum
			);
		}

		if (error.message.includes('amount too large') || error.message.includes('maximum amount')) {
			throw new LightningSwapError(
				LightningErrorCode.INVALID_AMOUNT,
				'Amount exceeds maximum threshold',
				`The requested amount of ${request.amountSats} satoshis exceeds the maximum allowed for ${request.destinationAsset} swaps.`,
				ErrorSeverity.MEDIUM,
				['Check the maximum swap amounts', 'Try with a smaller amount'],
				{ originalError: error, maximumAmount: 100000000 } // Example maximum
			);
		}

		if (
			error.message.includes('invalid address') ||
			error.message.includes('invalid destination')
		) {
			throw LightningErrors.invalidAddress(request.starknetAddress);
		}

		if (error.message.includes('expired') || error.message.includes('timeout')) {
			throw new LightningSwapError(
				LightningErrorCode.TIMEOUT,
				'Swap creation timed out',
				'The swap creation process timed out. Please try again.',
				ErrorSeverity.MEDIUM,
				['Try again with a fresh request'],
				{ originalError: error }
			);
		}

		if (
			error.message.includes('No valid intermediary found') ||
			error.message.includes('intermediary') ||
			error.message.includes('connection refused') ||
			error.message.includes('unable to connect')
		) {
			throw new LightningSwapError(
				LightningErrorCode.NETWORK_ERROR,
				'Intermediary connection failed',
				'Unable to connect to the intermediary service. This may be temporary.',
				ErrorSeverity.HIGH,
				[
					'Try again in a few moments',
					'Check your internet connection',
					'Contact support if the issue persists'
				],
				{ originalError: error }
			);
		}
	}

	// Generic fallback error
	throw new LightningSwapError(
		LightningErrorCode.SWAP_FAILED,
		'Failed to create Lightning swap',
		'Unable to create Lightning Network swap. Please try again.',
		ErrorSeverity.HIGH,
		['Check your internet connection', 'Verify the swap parameters', 'Try again later'],
		{ originalError: error, request }
	);
}

/**
 * Maps SDK errors to Lightning errors for Bitcoin-to-Starknet swaps
 */
export function handleBitcoinSwapError(
	error: unknown,
	request: BitcoinSwapRequest,
	context: { swapId?: string; phase?: string } = {}
): never {
	logger.error('Bitcoin swap error occurred', error as Error, {
		swapId: context.swapId,
		phase: context.phase,
		request: {
			amountSats: request.amountSats,
			destinationAsset: request.destinationAsset,
			starknetAddress: request.starknetAddress?.slice(0, 10) + '...'
		}
	});

	if (error instanceof Error) {
		// Handle specific SDK error patterns for Bitcoin swaps
		if (error.message.includes('insufficient liquidity')) {
			throw LightningErrors.insufficientLiquidity(request.destinationAsset);
		}

		if (error.message.includes('amount too small')) {
			throw new LightningSwapError(
				LightningErrorCode.INVALID_AMOUNT,
				'Bitcoin amount below minimum',
				`The requested amount of ${request.amountSats} satoshis is below the minimum required for Bitcoin to ${request.destinationAsset} swaps.`,
				ErrorSeverity.MEDIUM,
				['Check minimum Bitcoin swap amounts', 'Try with a larger amount'],
				{ originalError: error }
			);
		}

		if (error.message.includes('invalid address')) {
			throw LightningErrors.invalidAddress(request.starknetAddress);
		}
	}

	throw new LightningSwapError(
		LightningErrorCode.SWAP_FAILED,
		'Failed to create Bitcoin swap',
		'Unable to create Bitcoin to Starknet swap. Please try again.',
		ErrorSeverity.HIGH,
		[],
		{ originalError: error, request }
	);
}

/**
 * Maps SDK errors to Lightning errors for Starknet-to-Lightning swaps
 */
export function handleStarknetToLightningSwapError(
	error: unknown,
	request: StarknetToLightningSwapRequest,
	context: { swapId?: string; phase?: string } = {}
): never {
	logger.error('Starknet to Lightning swap error occurred', error as Error, {
		swapId: context.swapId,
		phase: context.phase,
		request: {
			sourceAsset: request.sourceAsset,
			starknetAddress: request.starknetAddress?.slice(0, 10) + '...',
			lightningAddress: request.lightningAddress?.slice(0, 20) + '...'
		}
	});

	if (error instanceof Error) {
		if (error.message.includes('insufficient liquidity')) {
			throw LightningErrors.insufficientLiquidity(request.sourceAsset);
		}

		if (error.message.includes('amount too small')) {
			throw new LightningSwapError(
				LightningErrorCode.INVALID_AMOUNT,
				'Lightning invoice amount validation failed',
				'The Lightning invoice amount is invalid. Please check the invoice and try again.',
				ErrorSeverity.MEDIUM,
				[],
				{ originalError: error }
			);
		}

		if (error.message.includes('invalid address')) {
			throw LightningErrors.invalidAddress(request.lightningAddress);
		}
	}

	throw new LightningSwapError(
		LightningErrorCode.SWAP_FAILED,
		'Failed to create Starknet to Lightning swap',
		'Unable to create Starknet to Lightning Network swap. Please try again.',
		ErrorSeverity.HIGH,
		[],
		{ originalError: error, request }
	);
}

/**
 * Handles general service initialization errors
 */
export function handleServiceInitializationError(error: unknown): never {
	logger.error('Atomiq service initialization failed', error as Error);

	if (error instanceof Error) {
		if (error.message.includes('RPC_URL')) {
			throw new LightningServiceError(
				LightningErrorCode.CONFIG_ERROR,
				'Invalid RPC configuration',
				'The Starknet RPC URL configuration is invalid. Please check the environment settings.',
				ErrorSeverity.HIGH,
				['Verify STARKNET_RPC_URL environment variable'],
				{ originalError: error }
			);
		}

		if (error.message.includes('network') || error.message.includes('connection')) {
			throw new LightningServiceError(
				LightningErrorCode.NETWORK_ERROR,
				'Network connectivity issue',
				'Unable to connect to required services. Please check your internet connection.',
				ErrorSeverity.HIGH,
				['Check internet connection', 'Verify service endpoints'],
				{ originalError: error }
			);
		}

		if (
			error.message.includes('No valid intermediary found') ||
			error.message.includes('intermediary')
		) {
			throw new LightningServiceError(
				LightningErrorCode.CONFIG_ERROR,
				'Intermediary service unavailable',
				'The intermediary service is currently unavailable. This is required for cross-chain swaps.',
				ErrorSeverity.HIGH,
				[
					'Try again in a few minutes',
					'Contact support if the issue persists',
					'Verify intermediary configuration'
				],
				{ originalError: error }
			);
		}
	}

	throw new LightningServiceError(
		LightningErrorCode.SERVICE_ERROR,
		'Service initialization failed',
		'The Atomiq service failed to initialize. Please try again.',
		ErrorSeverity.HIGH,
		['Try refreshing the page', 'Contact support if the issue persists'],
		{ originalError: error }
	);
}

/**
 * Handles swap monitoring and claim errors
 */
export function handleSwapOperationError(error: unknown, operation: string, swapId: string): never {
	logger.error(`Swap ${operation} failed`, error as Error, { swapId });

	if (error instanceof Error) {
		if (error.message.includes('timeout')) {
			throw new LightningSwapError(
				LightningErrorCode.TIMEOUT,
				`Swap ${operation} timed out`,
				`The ${operation} operation timed out. This may resolve automatically, or you can try again.`,
				ErrorSeverity.MEDIUM,
				['Wait a few minutes and check again', 'Try the operation again'],
				{ originalError: error, swapId }
			);
		}

		if (error.message.includes('not found') || error.message.includes('invalid swap')) {
			throw new LightningSwapError(
				LightningErrorCode.INVALID_SWAP_ID,
				'Swap not found',
				`Swap with ID ${swapId} was not found or is invalid.`,
				ErrorSeverity.MEDIUM,
				['Verify the swap ID', 'Check if the swap has expired'],
				{ originalError: error, swapId }
			);
		}
	}

	throw new LightningSwapError(
		LightningErrorCode.SWAP_FAILED,
		`Swap ${operation} failed`,
		`The ${operation} operation failed unexpectedly. Please try again.`,
		ErrorSeverity.HIGH,
		[],
		{ originalError: error, swapId }
	);
}
