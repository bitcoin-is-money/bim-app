/**
 * @fileoverview Claim Validation Service
 *
 * Handles validation logic for swap claims and transactions.
 * Extracted from SwapClaimerService for better separation of concerns.
 */

import { logger } from '$lib/utils/logger';
import { validateStarknetTxStructure } from '../starknet-utils';

export interface ValidationResult {
	isValid: boolean;
	violations: string[];
}

export class ClaimValidator {
	/**
	 * Validates unsigned claim transactions
	 */
	async validateUnsignedTransactions(
		unsignedTxs: any[],
		swapId: string
	): Promise<{
		success: boolean;
		transactions?: any[];
		message: string;
	}> {
		try {
			if (!unsignedTxs || !Array.isArray(unsignedTxs) || unsignedTxs.length === 0) {
				logger.warn('No unsigned transactions returned from SDK', { swapId });
				return {
					success: false,
					message: 'No unsigned transactions available for this swap.'
				};
			}

			logger.info('Validating unsigned transactions', {
				swapId,
				transactionCount: unsignedTxs.length
			});

			// Validate each transaction structure
			const validatedTransactions = [];
			for (let i = 0; i < unsignedTxs.length; i++) {
				const tx = unsignedTxs[i];
				const validation = this.validateTransactionStructure(tx);

				if (!validation.isValid) {
					logger.error('Invalid transaction structure detected', {
						swapId,
						transactionIndex: i,
						violations: validation.violations,
						transaction: tx
					});
					return {
						success: false,
						message: `Transaction ${i} has invalid structure: ${validation.violations.join(', ')}`
					};
				}

				validatedTransactions.push(tx);
			}

			return {
				success: true,
				transactions: validatedTransactions,
				message: `Retrieved ${validatedTransactions.length} unsigned transactions.`
			};
		} catch (error) {
			logger.error('Failed to validate unsigned claim transactions', error as Error, { swapId });
			return {
				success: false,
				message: `Failed to validate unsigned transactions: ${error instanceof Error ? error.message : 'Unknown error'}`
			};
		}
	}

	/**
	 * Validates individual transaction structure
	 */
	validateTransactionStructure(tx: any): ValidationResult {
		try {
			return validateStarknetTxStructure(tx);
		} catch (error) {
			logger.error('Transaction structure validation failed', error as Error, {
				tx
			});
			return {
				isValid: false,
				violations: [
					`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`
				]
			};
		}
	}

	/**
	 * Validates swap state for claiming
	 */
	validateSwapForClaiming(
		swap: any,
		swapId: string
	): {
		valid: boolean;
		message: string;
	} {
		if (!swap) {
			return {
				valid: false,
				message: 'Swap object is null or undefined'
			};
		}

		// Check if swap has required methods
		const requiredMethods = ['getState', 'getId'];
		for (const method of requiredMethods) {
			if (typeof swap[method] !== 'function') {
				return {
					valid: false,
					message: `Swap object missing required method: ${method}`
				};
			}
		}

		// Validate swap ID matches
		try {
			const actualSwapId = swap.getId();
			if (actualSwapId !== swapId) {
				return {
					valid: false,
					message: `Swap ID mismatch: expected ${swapId}, got ${actualSwapId}`
				};
			}
		} catch (error) {
			return {
				valid: false,
				message: `Failed to get swap ID: ${error instanceof Error ? error.message : 'Unknown error'}`
			};
		}

		return {
			valid: true,
			message: 'Swap is valid for claiming'
		};
	}

	/**
	 * Validates signed transactions before submission
	 */
	validateSignedTransactions(
		signedTransactions: any[],
		swapId: string
	): {
		valid: boolean;
		message: string;
	} {
		if (!Array.isArray(signedTransactions)) {
			return {
				valid: false,
				message: 'Signed transactions must be an array'
			};
		}

		if (signedTransactions.length === 0) {
			return {
				valid: false,
				message: 'No signed transactions provided'
			};
		}

		// Basic validation of signed transaction structure
		for (let i = 0; i < signedTransactions.length; i++) {
			const signedTx = signedTransactions[i];

			if (!signedTx || typeof signedTx !== 'object') {
				return {
					valid: false,
					message: `Signed transaction ${i} is not a valid object`
				};
			}

			// Check for signature presence (basic check)
			if (!signedTx.signature && !signedTx.r && !signedTx.s) {
				logger.warn('Signed transaction may be missing signature', {
					swapId,
					transactionIndex: i,
					signedTx
				});
			}
		}

		return {
			valid: true,
			message: `${signedTransactions.length} signed transactions validated successfully`
		};
	}
}
