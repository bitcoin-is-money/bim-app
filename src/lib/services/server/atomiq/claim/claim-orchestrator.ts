/**
 * @fileoverview Claim Orchestrator Service
 *
 * Orchestrates swap claiming operations by coordinating validation,
 * transaction cleaning, and execution. Main coordination logic extracted
 * from SwapClaimerService for better separation of concerns.
 */

import { logger } from '$lib/utils/logger';
import { handleSwapOperationError } from '../error-handlers';
import { executeTransaction, waitWithTimeout } from '../starknet-utils';
import type { AtomiqConfig } from '../types';
import { ClaimValidator } from './claim-validator';
import { TransactionCleaner } from './transaction-cleaner';

export interface ClaimResult {
	success: boolean;
	txHash?: string;
	message: string;
}

export class ClaimOrchestrator {
	private transactionCleaner: TransactionCleaner;
	private validator: ClaimValidator;

	constructor(private config: AtomiqConfig) {
		this.transactionCleaner = new TransactionCleaner();
		this.validator = new ClaimValidator();
		logger.info('ClaimOrchestrator initialized');
	}

	/**
	 * Claims a Lightning swap after payment has been received
	 */
	async claimLightningSwap(
		swap: any,
		swapId: string,
		starknetSigner?: any,
		isPaidInBackground: boolean = false
	): Promise<ClaimResult> {
		try {
			logger.info('Starting Lightning swap claim process', {
				swapId,
				isPaidInBackground
			});

			// Validate swap object
			const swapValidation = this.validator.validateSwapForClaiming(swap, swapId);
			if (!swapValidation.valid) {
				return {
					success: false,
					message: swapValidation.message
				};
			}

			let paymentSuccess = isPaidInBackground;

			if (!isPaidInBackground) {
				// Wait for Lightning payment to be received before proceeding with claim
				logger.info('Waiting for Lightning payment to be received', { swapId });
				paymentSuccess = await this.waitForPayment(swap);

				if (!paymentSuccess) {
					return {
						success: false,
						message: 'Lightning payment was not received in time.'
					};
				}

				logger.info('Lightning payment received, proceeding with claim', {
					swapId: swap.getId(),
					state: swap.getState()
				});
			}

			// If a signer is provided, use manual claim process
			if (starknetSigner) {
				return await this.performManualClaim(swap, swapId, starknetSigner);
			}

			// Otherwise try automatic claim
			return await this.performAutomaticClaim(swap, swapId);
		} catch (error) {
			logger.error('Lightning swap claim failed', error as Error, { swapId });
			handleSwapOperationError(error, 'claim', swapId);
		}
	}

	/**
	 * Gets unsigned claim transactions for manual signing
	 *
	 * NOTE: Based on Atomiq docs, there is no getUnsignedTxs function.
	 * For Starknet-to-Lightning swaps, claim transactions should be handled
	 * automatically by the SDK after proper commit confirmation.
	 */
	async getUnsignedClaimTransactions(
		swap: any,
		swapId: string
	): Promise<{
		success: boolean;
		transactions?: any[];
		message: string;
	}> {
		try {
			logger.info('Checking claim transaction availability', { swapId });

			if (!swap) {
				return {
					success: false,
					message: 'Swap object not available. The swap may have expired or been completed.'
				};
			}

			// Log available methods for debugging
			const availableMethods = swap
				? Object.getOwnPropertyNames(Object.getPrototypeOf(swap)).filter(
						(name) => typeof swap[name] === 'function'
					)
				: [];

			logger.info('Available swap methods', {
				swapId,
				methods: availableMethods,
				swapState: swap.getState ? swap.getState() : 'unknown'
			});

			// According to Atomiq docs, there is no getUnsignedTxs function
			// For Starknet-to-Lightning swaps, the claim process should be automatic
			// after proper commit confirmation using waitTillCommitted()
			return {
				success: false,
				message:
					'Manual claim transactions not supported for Starknet-to-Lightning swaps. Claims are handled automatically by the SDK after commit confirmation.'
			};
		} catch (error) {
			logger.error('Error checking claim transaction availability', error as Error, { swapId });
			return {
				success: false,
				message: 'Error accessing swap information. The swap may no longer be available.'
			};
		}
	}

	/**
	 * Submits signed transactions to complete the swap claim
	 */
	async submitSignedTransactions(
		swap: any,
		swapId: string,
		signedTransactions: any[]
	): Promise<ClaimResult> {
		try {
			logger.info('Submitting signed transactions', {
				swapId,
				transactionCount: signedTransactions.length
			});

			// Validate signed transactions
			const validation = this.validator.validateSignedTransactions(signedTransactions, swapId);
			if (!validation.valid) {
				return {
					success: false,
					message: validation.message
				};
			}

			// Execute signed transactions via RPC following Atomiq SDK docs pattern
			// Docs: Get unsigned -> Sign -> Execute via RPC -> Wait for confirmation
			const { executeSignedTransactionsViaRpc } = await import('../starknet-utils');
			const result = await executeSignedTransactionsViaRpc(
				signedTransactions,
				swapId,
				'claim',
				this.config
			);

			logger.info('Signed transactions submitted successfully', {
				swapId,
				result: typeof result,
				hasTransactionHash: !!(result?.transaction_hash || result?.txHash)
			});

			// Extract transaction hash
			const txHash = result?.transaction_hash || result?.txHash || result?.hash;

			if (txHash) {
				logger.info('Swap claimed successfully with transaction hash', {
					swapId,
					txHash
				});

				return {
					success: true,
					txHash,
					message: 'Lightning swap claimed successfully!'
				};
			} else {
				logger.warn('Swap claimed but no transaction hash returned', {
					swapId,
					result
				});

				return {
					success: true,
					message: 'Lightning swap claimed successfully (no transaction hash available).'
				};
			}
		} catch (error) {
			logger.error('Failed to submit signed transactions', error as Error, {
				swapId
			});
			return {
				success: false,
				message: `Failed to submit signed transactions: ${error instanceof Error ? error.message : 'Unknown error'}`
			};
		}
	}

	/**
	 * Waits for Lightning payment to be received
	 */
	private async waitForPayment(swap: any): Promise<boolean> {
		try {
			return await swap.waitForPayment();
		} catch (error) {
			logger.error('Error waiting for payment', error as Error);
			return false;
		}
	}

	/**
	 * Performs automatic claim without requiring signer
	 */
	private async performAutomaticClaim(swap: any, swapId: string): Promise<ClaimResult> {
		try {
			logger.info('Performing automatic swap claim', {
				swapId: swap.getId(),
				state: swap.getState()
			});

			// Try the direct claim approach for automatic processing
			if (typeof swap.claim === 'function') {
				logger.info('Attempting automatic claim for Lightning swap', {
					swapId
				});

				const claimResult = await swap.claim();

				return {
					success: true,
					txHash: claimResult?.txHash || claimResult?.transactionHash,
					message: 'Lightning swap claimed automatically'
				};
			}

			// If automatic claiming is not available
			return {
				success: false,
				message: 'Payment received but automatic claiming failed - manual claim required via API'
			};
		} catch (error) {
			logger.error('Automatic swap claim failed', error as Error, {
				swapId,
				operation: 'performAutomaticClaim'
			});

			return {
				success: false,
				message: error instanceof Error ? error.message : 'Unknown automatic claim error'
			};
		}
	}

	/**
	 * Performs manual claim using provided signer
	 */
	private async performManualClaim(
		swap: any,
		swapId: string,
		starknetSigner: any
	): Promise<ClaimResult> {
		try {
			logger.info('Performing manual claim with signer', { swapId });

			// Get unsigned transactions
			const unsignedResult = await this.getUnsignedClaimTransactions(swap, swapId);

			if (!unsignedResult.success || !unsignedResult.transactions) {
				return {
					success: false,
					message: unsignedResult.message
				};
			}

			// Execute each transaction
			const txHashes: string[] = [];
			for (let i = 0; i < unsignedResult.transactions.length; i++) {
				const tx = unsignedResult.transactions[i];
				const txHash = await executeTransaction(
					tx,
					starknetSigner,
					swapId,
					`claim-${i}`,
					this.config
				);
				if (txHash) {
					txHashes.push(txHash);
				}
			}

			// Wait for commit confirmation (if this was a commit phase)
			logger.info('Waiting for commit confirmation', { swapId });
			await waitWithTimeout(
				() => swap.waitTillCommited(),
				'commit confirmation',
				swapId,
				this.config.timeout
			);
			logger.info('Commit confirmed', { swapId });

			// Wait for claim confirmation (if this was a claim phase)
			logger.info('Waiting for claim confirmation', { swapId });
			await waitWithTimeout(
				() => swap.waitTillClaimed(),
				'claim confirmation',
				swapId,
				this.config.timeout
			);
			logger.info('Claim confirmed', { swapId });

			// Fallback: Wait for SDK confirmation (legacy method)
			if (typeof swap.waitForFinalization === 'function') {
				logger.info('Using legacy waitForFinalization method', { swapId });
				await waitWithTimeout(
					() => swap.waitForFinalization(),
					'claim finalization',
					swapId,
					this.config.timeout
				);
			}

			return {
				success: true,
				txHash: txHashes[0], // Return the first transaction hash
				message: `Lightning swap claimed successfully! Executed ${txHashes.length} transactions.`
			};
		} catch (error) {
			logger.error('Manual claim failed', error as Error, { swapId });
			throw error;
		}
	}
}
