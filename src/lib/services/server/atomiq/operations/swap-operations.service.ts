import {
	createDefaultFeeCall,
	extractSwapAmountFromTransactions
} from '$lib/utils/fee-transaction.utils';
import { logger } from '$lib/utils/logger';
import { SelectorUtils } from '$lib/utils/selector-utils';
import { ClaimOrchestrator } from '../claim';
import type { InitializedServices } from '../initialization/services-initializer.service';
import { executeSignedTransactionsViaRpc } from '../starknet-utils';
import type { SwapStatusUpdate } from '../types';

export class SwapOperationsService {
	private services: InitializedServices;
	private claimOrchestrator: ClaimOrchestrator;
	private config: any;

	constructor(services: InitializedServices, config: any) {
		this.services = services;
		this.config = config;
		this.claimOrchestrator = new ClaimOrchestrator(config);
		logger.info('SwapOperationsService initialized with claim orchestrator');
	}

	// ===== Lightning Swap Operations =====

	async createLightningToStarknetSwap(
		request: any // LightningSwapRequest
	): Promise<any> {
		// LightningSwapResponse
		if (!this.services.lightningToStarknetService) {
			throw new Error('Lightning swaps service not initialized');
		}

		const result =
			await this.services.lightningToStarknetService.createLightningToStarknetSwap(request);

		// Register the swap with the registry for status tracking
		if (this.services.swapRegistry && result.swapId) {
			// Use the actual swap object returned from the service
			if (!result.swapObject) {
				throw new Error('Swap object not returned from lightningToStarknetService');
			}

			this.services.swapRegistry.registerSwap(
				result.swapId,
				result.swapObject,
				'lightning_to_starknet'
			);

			// Also register with monitor service
			if (this.services.swapMonitorService) {
				this.services.swapMonitorService.registerSwap(result.swapId, result.swapObject);

				// For Lightning-to-Starknet swaps, start payment waiting immediately
				// since the invoice is ready to receive payments
				this.services.swapMonitorService.startBackgroundPaymentWaiting(
					result.swapObject,
					result.swapId
				);

				logger.info('Background payment monitoring started for Lightning swap', {
					swapId: result.swapId,
					swapState: result.swapObject.getState()
				});
			} else {
				logger.error(
					'SwapMonitorService not available - background payment monitoring will NOT work',
					{
						swapId: result.swapId,
						direction: 'lightning_to_starknet',
						criticalError: 'Payment monitoring disabled'
					}
				);
			}

			logger.info('Registered Lightning swap with registry and monitor', {
				swapId: result.swapId,
				direction: 'lightning_to_starknet',
				hasSwapObject: !!result.swapObject,
				paymentWaitingStarted: !!this.services.swapMonitorService
			});
		}

		// Return just the response part (without swapObject)
		const { swapObject, ...response } = result;
		return response;
	}

	// ===== Bitcoin Swap Operations =====

	async createBitcoinSwap(
		request: any // BitcoinSwapRequest
	): Promise<any> {
		// BitcoinSwapResponse
		if (!this.services.bitcoinSwapsService) {
			throw new Error('Bitcoin swaps service not initialized');
		}

		return await this.services.bitcoinSwapsService.createBitcoinSwap(request);
	}

	// ===== Starknet Swap Operations =====

	async createStarknetToLightningSwap(
		request: any // StarknetToLightningSwapRequest
	): Promise<any> {
		// StarknetToLightningSwapResponse
		if (!this.services.starknetToLightningService) {
			throw new Error('Starknet swaps service not initialized');
		}

		const result =
			await this.services.starknetToLightningService.createStarknetToLightningSwap(request);

		// Register the swap with the registry for status tracking
		if (this.services.swapRegistry && result.swapId) {
			// Use the actual swap object returned from the service
			if (!result.swapObject) {
				throw new Error('Swap object not returned from starknetToLightningService');
			}

			this.services.swapRegistry.registerSwap(
				result.swapId,
				result.swapObject,
				'starknet_to_lightning'
			);

			// Also register with monitor service
			if (this.services.swapMonitorService) {
				this.services.swapMonitorService.registerSwap(result.swapId, result.swapObject);

				// NOTE: For Starknet-to-Lightning swaps, we do NOT start background payment waiting here
				// because waitForPayment() can only be called after the commit phase (state 1).
				// Payment waiting will be started after the user commits the Starknet transaction.
				// For Lightning-to-Starknet swaps, payment waiting starts immediately after creation.
			}

			logger.info('Registered Starknet to Lightning swap with registry and monitor', {
				swapId: result.swapId,
				direction: 'starknet_to_lightning',
				hasSwapObject: !!result.swapObject
			});
		}

		// Return just the response part (without swapObject)
		const { swapObject, ...response } = result;
		return response;
	}

	async createStarknetToBitcoinSwap(
		request: any // StarknetToBitcoinSwapRequest
	): Promise<any> {
		if (!this.services.starknetToBitcoinService) {
			throw new Error('Starknet→Bitcoin swaps service not initialized');
		}

		const result =
			await this.services.starknetToBitcoinService.createStarknetToBitcoinSwap(request);

		if (this.services.swapRegistry && result.swapId) {
			if (!result.swapObject) {
				throw new Error('Swap object not returned from starknetToBitcoinService');
			}

			this.services.swapRegistry.registerSwap(
				result.swapId,
				result.swapObject,
				'starknet_to_bitcoin'
			);

			if (this.services.swapMonitorService) {
				this.services.swapMonitorService.registerSwap(result.swapId, result.swapObject);

				// Track the deposit address for this Bitcoin swap
				this.services.swapMonitorService.trackBitcoinSwapDeposit(
					result.swapId,
					result.starknetAddress
				);

				// Start background monitoring for Bitcoin swaps to detect deposits
				// Bitcoin swaps need monitoring to verify that the Starknet transaction
				// was confirmed before considering the swap expired
				this.services.swapMonitorService.startBackgroundDepositMonitoring(
					result.swapObject,
					result.swapId,
					'starknet_to_bitcoin'
				);

				logger.info('Background deposit monitoring started for Bitcoin swap', {
					swapId: result.swapId,
					swapState: result.swapObject.getState(),
					direction: 'starknet_to_bitcoin',
					depositAddress: result.starknetAddress.substring(0, 10) + '...'
				});
			} else {
				logger.error('SwapMonitorService not available - background monitoring will NOT work', {
					swapId: result.swapId,
					direction: 'starknet_to_bitcoin',
					criticalError: 'Deposit monitoring disabled'
				});
			}

			logger.info('Registered Bitcoin swap with registry and monitor', {
				swapId: result.swapId,
				direction: 'starknet_to_bitcoin',
				hasSwapObject: !!result.swapObject,
				depositMonitoringStarted: !!this.services.swapMonitorService
			});
		}

		const { swapObject, ...response } = result;
		return response;
	}

	// ===== Swap Status Operations =====

	getSwapStatus(swapId: string): SwapStatusUpdate | null {
		// Use SwapMonitorService to get real status from the SDK swap object
		if (!this.services.swapMonitorService) {
			logger.warn('SwapMonitorService not available, returning null status', {
				swapId
			});
			return null;
		}

		const statusUpdate = this.services.swapMonitorService.getSwapStatus(swapId);

		if (!statusUpdate) {
			logger.debug('Swap not found in monitor service, checking registry', {
				swapId
			});
			// If not in monitor service, check if it exists in registry
			const swap = this.services.swapRegistry?.getSwap(swapId);
			if (!swap) {
				return null;
			}

			// If swap exists in registry but not in monitor, register it
			this.services.swapMonitorService.registerSwap(swapId, swap);
			return this.services.swapMonitorService.getSwapStatus(swapId);
		}

		return statusUpdate;
	}

	// ===== Swap Claiming Operations =====

	async claimLightningSwap(
		swapId: string,
		starknetSigner?: any
	): Promise<{ success: boolean; txHash?: string; message: string }> {
		// Get the swap object from registry
		const swap = this.services.swapRegistry?.getSwap(swapId);

		if (!swap) {
			return {
				success: false,
				message: 'Swap not found or expired'
			};
		}

		// Use ClaimOrchestrator directly instead of wrapper services
		const result = await this.claimOrchestrator.claimLightningSwap(
			swap,
			swapId,
			starknetSigner,
			false // isPaidInBackground - simplified for now
		);

		return result;
	}

	// ===== Transaction Operations =====

	async getUnsignedClaimTransactions(swapId: string): Promise<{
		success: boolean;
		transactions?: any[];
		message: string;
	}> {
		if (!this.services.swapClaimerService) {
			throw new Error('Swap claimer service not initialized');
		}

		const swap = this.services.swapRegistry?.getSwap(swapId);

		if (!swap) {
			return {
				success: false,
				message: 'Swap not found or expired'
			};
		}

		return await this.services.swapClaimerService.getUnsignedClaimTransactions(swap, swapId);
	}

	/**
	 * Submits signed transactions to complete the swap claim
	 */
	async submitSignedTransactions(
		swapId: string,
		phase: 'commit' | 'claim' | 'commit-and-claim',
		signedTransactions: any[]
	): Promise<{ success: boolean; txHash?: string; message: string }> {
		try {
			if (!swapId) {
				return {
					success: false,
					message: 'Swap ID is required'
				};
			}

			const swap = this.services.swapRegistry?.getSwap(swapId);
			if (!swap) {
				return {
					success: false,
					message: 'Swap not found or expired'
				};
			}

			// Get swap direction and state to determine the correct method to use
			const swapInfo = this.services.swapRegistry?.getSwapInfo(swapId);
			const swapDirection = swapInfo?.direction;
			const swapState = swap.getState();

			logger.info('Submitting signed transactions', {
				swapId,
				phase,
				swapDirection,
				swapState,
				transactionCount: signedTransactions.length
			});

			// Handle different swap directions and states
			// Following Atomiq SDK docs: Get unsigned -> Sign -> Execute via RPC -> Wait for confirmation
			// We receive already-signed transactions, so we execute them via RPC directly
			if (swapDirection === 'starknet_to_lightning') {
				if (swapState === 0) {
					// Commit phase - execute signed transactions via RPC (docs pattern)
					logger.info('Executing Starknet-to-Lightning commit transactions via RPC', { swapId, phase });
					const result = await executeSignedTransactionsViaRpc(
						signedTransactions,
						swapId,
						phase,
						this.config
					);

					logger.info('Starknet-to-Lightning commit transactions executed successfully via RPC', {
						swapId,
						transactionHash: result.transaction_hash
					});

					// Wait for SDK confirmation (docs pattern: execute -> waitTillCommited)
					logger.info('Waiting for commit transaction to be confirmed by Atomiq SDK', { swapId });
					try {
						await swap.waitTillCommited();
						logger.info('Commit transaction confirmed by Atomiq SDK', {
							swapId,
							newState: swap.getState()
						});
					} catch (waitError) {
						logger.warn('waitTillCommited failed, but commit may still have succeeded', {
							swapId,
							error: waitError instanceof Error ? waitError.message : 'Unknown error',
							currentState: swap.getState()
						});
					}

					return {
						success: true,
						txHash: result.transaction_hash,
						message: 'Starknet-to-Lightning commit transactions executed successfully via RPC'
					};
				} else if (swapState === 1) {
					// Refund phase - execute signed transactions via RPC (docs pattern)
					logger.info('Executing Starknet-to-Lightning refund transactions via RPC', { swapId, phase });
					const result = await executeSignedTransactionsViaRpc(
						signedTransactions,
						swapId,
						phase,
						this.config
					);

					logger.info('Starknet-to-Lightning refund transactions executed successfully via RPC', {
						swapId,
						transactionHash: result.transaction_hash
					});

					// Wait for SDK confirmation (docs pattern)
					if (typeof swap.waitTillRefunded === 'function') {
						try {
							await swap.waitTillRefunded();
						} catch (waitError) {
							logger.warn('waitTillRefunded failed, but refund may still have succeeded', {
								swapId,
								error: waitError instanceof Error ? waitError.message : 'Unknown error'
							});
						}
					}

					return {
						success: true,
						txHash: result.transaction_hash,
						message: 'Starknet-to-Lightning refund transactions executed successfully via RPC'
					};
				}
			} else if (swapDirection === 'lightning_to_starknet' && swapState === 1) {
				// Lightning-to-Starknet commit phase - execute signed transactions via RPC (docs pattern)
				logger.info('Executing Lightning-to-Starknet commit transactions via RPC', { swapId, phase });
				const result = await executeSignedTransactionsViaRpc(
					signedTransactions,
					swapId,
					phase,
					this.config
				);

				logger.info('Lightning-to-Starknet commit transactions executed successfully via RPC', {
					swapId,
					transactionHash: result.transaction_hash
				});

				// Wait for the SDK to detect the transaction execution and update state from 1 → 2
				logger.info('Waiting for commit transaction to be confirmed by Atomiq SDK', { swapId });
				try {
					await swap.waitTillCommited();
					logger.info('Commit transaction confirmed by Atomiq SDK, swap state should now be 2', {
						swapId,
						newState: swap.getState()
					});
				} catch (waitError) {
					logger.warn('waitTillCommited failed, but commit may still have succeeded', {
						swapId,
						error: waitError instanceof Error ? waitError.message : 'Unknown error',
						currentState: swap.getState()
					});
				}

				return {
					success: true,
					txHash: result.transaction_hash,
					message:
						'Lightning-to-Starknet commit transactions executed successfully via RPC. Swap is now ready for claim phase.'
				};
			} else if (swapDirection === 'lightning_to_starknet' && swapState === 2) {
				// Lightning-to-Starknet claim phase - execute signed transactions via RPC (docs pattern)
				logger.info('Executing Lightning-to-Starknet claim transactions via RPC', { swapId, phase });
				const result = await executeSignedTransactionsViaRpc(
					signedTransactions,
					swapId,
					phase,
					this.config
				);

				logger.info('Lightning-to-Starknet claim transactions executed successfully via RPC', {
					swapId,
					transactionHash: result.transaction_hash
				});

				// Wait for the SDK to detect the transaction execution and update state to final
				logger.info('Waiting for claim transaction to be confirmed by Atomiq SDK', { swapId });
				try {
					await swap.waitTillClaimed();
					logger.info('Claim transaction confirmed by Atomiq SDK, swap should now be completed', {
						swapId,
						finalState: swap.getState()
					});
				} catch (waitError) {
					logger.warn('waitTillClaimed failed, but claim may still have succeeded', {
						swapId,
						error: waitError instanceof Error ? waitError.message : 'Unknown error',
						currentState: swap.getState()
					});
				}

				// Mark the swap as claimed/completed
				if (this.services.swapMonitorService) {
					this.services.swapMonitorService.markSwapAsClaimed(swapId);
					logger.info('Lightning-to-Starknet swap marked as claimed', {
						swapId,
						txHash: result.transaction_hash
					});
				}

				return {
					success: true,
					txHash: result.transaction_hash,
					message: 'Lightning-to-Starknet claim transactions executed successfully via RPC'
				};
			}

			// Fallback: execute via RPC for other cases (docs pattern)
			logger.info('Executing signed transactions via RPC (fallback)', { swapId });
			const result = await executeSignedTransactionsViaRpc(
				signedTransactions,
				swapId,
				'unknown',
				this.config
			);

			logger.info('Signed transactions executed successfully via RPC', {
				swapId,
				transactionHash: result.transaction_hash
			});

			return {
				success: true,
				txHash: result.transaction_hash,
				message: 'Signed transactions executed successfully via RPC'
			};
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

	async getUnsignedTransactions(swapId: string): Promise<{
		success: boolean;
		transactions?: any[];
		phase?: 'commit' | 'claim' | 'commit-and-claim';
		message: string;
	}> {
		try {
			if (!swapId) {
				return {
					success: false,
					message: 'Swap ID is required'
				};
			}

			const swap = this.services.swapRegistry?.getSwap(swapId);
			if (!swap) {
				return {
					success: false,
					message: 'Swap not found or expired'
				};
			}

			const swapStatus = this.getSwapStatus(swapId);
			logger.info('Swap status check', {
				swapId,
				swapStatus,
				hasSwapStatus: !!swapStatus,
				status: swapStatus?.status
			});

			if (!swapStatus || swapStatus.status === 'completed' || swapStatus.status === 'expired') {
				logger.warn('Swap not in valid state for unsigned transactions', {
					swapId,
					swapStatus
				});
				return {
					success: false,
					message: 'Swap is not in a state that requires unsigned transactions'
				};
			}

			// Get swap direction from registry
			const swapInfo = this.services.swapRegistry?.getSwapInfo(swapId);
			const swapDirection = swapInfo?.direction;
			const swapState = swap.getState();

			logger.info('🔍 DEBUG: Getting unsigned transactions', {
				swapId,
				swapDirection,
				swapState,
				swapStatus: swapStatus.status,
				hasSwap: !!swap,
				hasSwapInfo: !!swapInfo,
				timestamp: new Date().toISOString()
			});

			// Determine phase based on swap direction and state
			let phase: 'commit' | 'claim' | 'commit-and-claim' = 'claim';
			if (swapDirection === 'starknet_to_lightning' && swapState === 0) {
				phase = 'commit';
			} else if (swapDirection === 'starknet_to_lightning' && swapState === 1) {
				phase = 'claim'; // Starknet-to-Lightning refund phase
			} else if (swapDirection === 'lightning_to_starknet' && swapState === 1) {
				phase = 'claim'; // Lightning-to-Starknet: State 1 (PR_PAID) - LP commits automatically, wait then claim
			} else if (swapDirection === 'lightning_to_starknet' && swapState === 2) {
				phase = 'claim'; // Lightning-to-Starknet claim phase (after commit)
			} else if (swapDirection === 'starknet_to_bitcoin' && swapState === 0) {
				// For Starknet→Bitcoin (ToBTC) swaps, the initial action is a commit on Starknet
				phase = 'commit';
			}

			try {
				// Debug: Log available methods on the swap object
				logger.info('Swap object methods check', {
					swapId,
					phase,
					hasGetState: typeof swap.getState === 'function',
					hasGetId: typeof swap.getId === 'function',
					hasWaitTillCommitted: typeof swap.waitTillCommited === 'function',
					hasWaitTillClaimed: typeof swap.waitTillClaimed === 'function',
					availableMethods: Object.getOwnPropertyNames(Object.getPrototypeOf(swap)).filter(
						(name) => typeof swap[name] === 'function'
					)
				});

				// For Starknet-to-Lightning swaps, we need to get the appropriate transactions
				// based on the current phase using real Atomiq SDK methods
				if (phase === 'commit') {
					// For commit phase, we need to get commit transactions from the SDK
					const availableMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(swap)).filter(
						(name) => typeof swap[name] === 'function'
					);

					logger.info('Getting real commit transactions from Atomiq SDK', {
						swapId,
						phase,
						swapState,
						hasTxsCommit: typeof swap.txsCommit === 'function',
						availableMethods
					});

					// Check if txsCommit method exists before calling it
					if (typeof swap.txsCommit !== 'function') {
						logger.error('txsCommit method not available on swap object', undefined, {
							swapId,
							swapState,
							swapDirection,
							availableMethods,
							swapType: swap.constructor?.name,
							swapKeys: Object.keys(swap)
						});

						return {
							success: false,
							message: `Cannot get commit transactions: txsCommit method is not available on this swap. Available methods: ${availableMethods.join(', ')}`
						};
					}

					try {
						// Use the real Atomiq SDK method to get commit transactions
						// According to Atomiq SDK docs, txsCommit() is called without parameters
						const sdkTransactions = await swap.txsCommit();

						logger.info('Successfully retrieved commit transactions from SDK', {
							swapId,
							transactionCount: sdkTransactions.length,
							transactionTypes: sdkTransactions.map((tx) => tx.type)
						});

						// Optionally add a fee call in commit multicall for Starknet→Lightning and Starknet→Bitcoin.
						// This appends an ERC-20 transfer fee call to the first multicall.
						let modifiedTransactions = [...sdkTransactions];
						if (
							swapDirection === 'starknet_to_lightning' ||
							swapDirection === 'starknet_to_bitcoin'
						) {
							try {
								const swapAmount = extractSwapAmountFromTransactions(sdkTransactions);
								if (swapAmount && swapAmount > 0n && sdkTransactions.length > 0) {
									// Determine token address from the first transaction calls
									let tokenAddress = null as string | null;
									const firstTx = sdkTransactions[0];
									if (firstTx.type === 'INVOKE' && Array.isArray(firstTx.tx)) {
										// Prefer calls that look like ERC-20 operations
										const preferred = firstTx.tx.find(
											(call: any) =>
												typeof call?.entrypoint === 'string' &&
												['transfer', 'transferFrom', 'approve'].includes(call.entrypoint) &&
												!!call?.contractAddress
										);
										tokenAddress = preferred?.contractAddress || null;
										// Fallback to the first call's contract address if not found
										if (!tokenAddress) {
											for (const call of firstTx.tx) {
												if (call.contractAddress) {
													tokenAddress = call.contractAddress;
													break;
												}
											}
										}
									}

									if (tokenAddress) {
										// Create fee call for multicall
										const feeCall = createDefaultFeeCall(tokenAddress, swapAmount);

										// Clone the first transaction and append the fee call
										const modifiedFirstTx = {
											...firstTx,
											tx: [...firstTx.tx, feeCall]
										};

										// Replace the first transaction with the modified one
										modifiedTransactions[0] = modifiedFirstTx;

										logger.info(
											swapDirection === 'starknet_to_lightning'
												? 'Added fee call to Starknet-to-Lightning commit transaction'
												: 'Added fee call to Starknet-to-Bitcoin commit transaction',
											{
												swapId,
												tokenAddress,
												swapAmount: swapAmount.toString(),
												totalCalls: modifiedFirstTx.tx.length,
												feeCall: {
													contractAddress: feeCall.contractAddress,
													entrypoint: feeCall.entrypoint
												}
											}
										);
									}
								}
							} catch (feeError) {
								logger.warn(
									swapDirection === 'starknet_to_lightning'
										? 'Failed to add fee call to Starknet-to-Lightning commit transaction'
										: 'Failed to add fee call to Starknet-to-Bitcoin commit transaction',
									{
										swapId,
										error: feeError instanceof Error ? feeError.message : 'Unknown error'
									}
								);
								// Continue with original transactions if fee addition fails
							}
						}

						// Convert modified SDK transactions to our API format and ensure hex selectors
						const transactions = modifiedTransactions.map((sdkTx, index) => {
							// Determine description based on swap direction
							let description: string;
							if (swapDirection === 'lightning_to_starknet') {
								description = `Lightning to Starknet swap commit transaction ${index + 1}`;
							} else if (swapDirection === 'starknet_to_lightning') {
								description = `Starknet to Lightning swap commit transaction ${index + 1}`;
							} else {
								description = `Starknet to Bitcoin swap commit transaction ${index + 1}`;
							}

							const transaction = {
								type: sdkTx.type,
								tx: sdkTx.tx, // This is already in the correct format (Array<Call> for INVOKE)
								details: {
									...sdkTx.details,
									description,
									index
								}
							};

							// Convert string selectors to hex format for PaymasterRpc compatibility
							return SelectorUtils.convertTransactionSelectorsToHex(transaction);
						});

						return {
							success: true,
							transactions,
							phase,
							message: `Retrieved ${transactions.length} unsigned commit transaction(s) from Atomiq SDK.`
						};
					} catch (sdkError) {
						logger.error('Failed to get commit transactions from Atomiq SDK', sdkError as Error, {
							swapId,
							phase,
							swapState
						});

						return {
							success: false,
							message: `Failed to get commit transactions: ${sdkError instanceof Error ? sdkError.message : 'Unknown SDK error'}`
						};
					}
				} else if (phase === 'claim') {
					// Handle different claim types based on swap direction
					if (swapDirection === 'lightning_to_starknet') {
						// Lightning-to-Starknet: LP commits automatically, no txsCommit method available
						// State 1: Wait for LP commit, then get claim transactions
						// State 2: Already committed, get claim transactions directly
						if (swapState === 1) {
							// State 1 (PR_PAID) - LP commits automatically, wait for state 2
							logger.info('Lightning-to-Starknet state 1: waiting for LP commit...', {
								swapId,
								currentState: swapState,
								swapDirection
							});

							try {
								// Wait for LP to commit (transitions state 1 → 2)
								await swap.waitTillCommited();

								logger.info('LP commit confirmed, now getting claim transactions', {
									swapId,
									newState: swap.getState?.() ?? 'unknown'
								});

								// Now in state 2, get claim transactions
								const sdkTransactions = await swap.txsClaim();

								logger.info('Successfully retrieved Lightning claim transactions after LP commit', {
									swapId,
									transactionCount: sdkTransactions.length,
									transactionTypes: sdkTransactions.map((tx: any) => tx.type)
								});

								// Convert SDK transactions to our API format and ensure hex selectors
								const transactions = sdkTransactions.map((sdkTx: any, index: number) => {
									const transaction = {
										type: sdkTx.type,
										tx: sdkTx.tx,
										details: {
											...sdkTx.details,
											description: `Lightning to Starknet swap claim transaction ${index + 1}`,
											index
										}
									};

									// Convert string selectors to hex format for PaymasterRpc compatibility
									return SelectorUtils.convertTransactionSelectorsToHex(transaction);
								});

								return {
									success: true,
									transactions,
									phase: 'claim',
									message: `Retrieved ${transactions.length} unsigned Lightning claim transaction(s) after LP commit.`
								};
							} catch (error) {
								logger.error('Failed waiting for LP commit or getting claim transactions', error as Error, {
									swapId,
									swapState,
									swapDirection
								});

								return {
									success: false,
									message: `Waiting for LP commit failed: ${error instanceof Error ? error.message : 'Unknown error'}`
								};
							}
						} else if (swapState === 2) {
							// State 2 (CLAIM_COMMITED) - commit confirmed, now we can claim
							const availableMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(swap)).filter(
								(name) => typeof swap[name] === 'function'
							);

							logger.info('Getting Lightning-to-Starknet claim transactions from Atomiq SDK', {
								swapId,
								phase,
								swapState,
								swapDirection,
								hasTxsClaim: typeof swap.txsClaim === 'function',
								availableMethods
							});

							// Check if txsClaim method exists before calling it
							if (typeof swap.txsClaim !== 'function') {
								logger.error('txsClaim method not available on swap object', undefined, {
									swapId,
									swapState,
									swapDirection,
									availableMethods,
									swapType: swap.constructor?.name,
									swapKeys: Object.keys(swap)
								});

								return {
									success: false,
									message: `Cannot get claim transactions: txsClaim method is not available on this swap. Available methods: ${availableMethods.join(', ')}`
								};
							}

							try {
								// For Lightning-to-Starknet swaps in state 2, use txsClaim to get claim transactions
								const sdkTransactions = await swap.txsClaim();

								logger.info('Successfully retrieved Lightning claim transactions from SDK', {
									swapId,
									transactionCount: sdkTransactions.length,
									transactionTypes: sdkTransactions.map((tx) => tx.type)
								});

								// Convert SDK transactions to our API format and ensure hex selectors
								const transactions = sdkTransactions.map((sdkTx, index) => {
									const transaction = {
										type: sdkTx.type,
										tx: sdkTx.tx,
										details: {
											...sdkTx.details,
											description: `Lightning to Starknet swap claim transaction ${index + 1}`,
											index
										}
									};

									// Convert string selectors to hex format for PaymasterRpc compatibility
									return SelectorUtils.convertTransactionSelectorsToHex(transaction);
								});

								return {
									success: true,
									transactions,
									phase,
									message: `Retrieved ${transactions.length} unsigned Lightning claim transaction(s) from Atomiq SDK.`
								};
							} catch (sdkError) {
								logger.error(
									'Failed to get Lightning claim transactions from Atomiq SDK',
									sdkError as Error,
									{
										swapId,
										phase,
										swapState,
										swapDirection
									}
								);

								return {
									success: false,
									message: `Failed to get Lightning claim transactions: ${sdkError instanceof Error ? sdkError.message : 'Unknown SDK error'}`
								};
							}
						} else {
							return {
								success: false,
								message: `Lightning-to-Starknet swap is in invalid state for claiming: ${swapState}. Expected state 1 (PR_PAID) or state 2 (CLAIM_COMMITED).`
							};
						}
					} else {
						// Starknet-to-Lightning refund phase, check if swap is refundable and get refund transactions
						logger.info('Getting refund transactions from Atomiq SDK', {
							swapId,
							phase,
							swapState,
							swapDirection,
							hasTxsRefund: typeof swap.txsRefund === 'function',
							hasIsRefundable: typeof swap.isRefundable === 'function'
						});

						try {
							// Check if the swap is in a refundable state
							const isRefundable =
								typeof swap.isRefundable === 'function' ? swap.isRefundable() : true;

							if (!isRefundable) {
								return {
									success: false,
									message: 'Swap is not in a refundable state'
								};
							}

							// Get refund transactions - pass the user's address as signer parameter
							const userAddress = swap.data?.getOfferer?.() || swap._getInitiator?.();
							const sdkTransactions = await swap.txsRefund(userAddress);

							logger.info('Successfully retrieved refund transactions from SDK', {
								swapId,
								transactionCount: sdkTransactions.length,
								transactionTypes: sdkTransactions.map((tx) => tx.type),
								userAddress
							});

							// Convert SDK transactions to our API format and ensure hex selectors
							const transactions = sdkTransactions.map((sdkTx, index) => {
								const transaction = {
									type: sdkTx.type,
									tx: sdkTx.tx, // This is already in the correct format (Array<Call> for INVOKE)
									details: {
										...sdkTx.details,
										description: `Starknet to Lightning swap refund transaction ${index + 1}`,
										index
									}
								};

								// Convert string selectors to hex format for PaymasterRpc compatibility
								return SelectorUtils.convertTransactionSelectorsToHex(transaction);
							});

							return {
								success: true,
								transactions,
								phase,
								message: `Retrieved ${transactions.length} unsigned refund transaction(s) from Atomiq SDK.`
							};
						} catch (sdkError) {
							logger.error('Failed to get refund transactions from Atomiq SDK', sdkError as Error, {
								swapId,
								phase,
								swapState
							});

							return {
								success: false,
								message: `Failed to get refund transactions: ${sdkError instanceof Error ? sdkError.message : 'Unknown SDK error'}`
							};
						}
					}
				} else {
					// For other phases, use the claim orchestrator as fallback
					logger.info('Using claim orchestrator for non-standard phase', {
						swapId,
						phase,
						swapState
					});

					const result = await this.claimOrchestrator.getUnsignedClaimTransactions(swap, swapId);
					return {
						success: result.success,
						transactions: result.transactions || [],
						phase,
						message: result.message
					};
				}
			} catch (error) {
				logger.error('Failed to get unsigned transactions', error as Error, {
					swapId,
					phase
				});
				return {
					success: false,
					message: 'Failed to get unsigned transactions'
				};
			}
		} catch (error) {
			logger.error('Failed to get unsigned transactions', error as Error);
			return {
				success: false,
				message: 'Failed to get unsigned transactions'
			};
		}
	}

	/**
	 * Start background payment waiting for Starknet-to-Lightning swaps after commit
	 * This should be called after the commit phase is completed and swap is in state 1 (COMMITED)
	 */
	async startPaymentWaitingAfterCommit(swapId: string): Promise<{
		success: boolean;
		message: string;
	}> {
		try {
			if (!swapId) {
				return {
					success: false,
					message: 'Swap ID is required'
				};
			}

			const swap = this.services.swapRegistry?.getSwap(swapId);
			if (!swap) {
				return {
					success: false,
					message: 'Swap not found or expired'
				};
			}

			// Check swap state - for Starknet-to-Lightning swaps, we may need to be more flexible
			const swapState = swap.getState();

			logger.info('Checking swap state for payment waiting', {
				swapId,
				currentState: swapState,
				swapType: 'Starknet-to-Lightning'
			});

			// For Starknet-to-Lightning swaps, state 1 is COMMITTED, but we should also handle
			// cases where the swap is in transition or waiting states
			if (swapState !== 1 && swapState !== 0) {
				// State -1 typically means error, but if we're here after successful commit,
				// it might be a temporary state. Let's be more permissive for now.
				logger.warn('Swap not in expected COMMITTED state, but proceeding with payment waiting', {
					swapId,
					currentState: swapState,
					expectedState: 1
				});

				// Don't fail immediately - try to start payment waiting anyway
				// as the frontend has confirmed successful commit
			}

			// Start background payment waiting
			if (this.services.swapMonitorService) {
				this.services.swapMonitorService.startBackgroundPaymentWaiting(swap, swapId);

				logger.info('Started background payment waiting after commit', {
					swapId,
					swapState
				});

				return {
					success: true,
					message: 'Background payment waiting started successfully'
				};
			}

			return {
				success: false,
				message: 'Swap monitor service not available'
			};
		} catch (error) {
			logger.error('Failed to start payment waiting after commit', error as Error, { swapId });
			return {
				success: false,
				message: 'Failed to start payment waiting'
			};
		}
	}

	/**
	 * Wait for commit confirmation using proper Atomiq SDK waitTillCommitted() method
	 *
	 * According to Atomiq docs: "After sending the transactions, you also need to make sure
	 * the SDK has enough time to receive an event notification of the transaction being executed,
	 * for this you have the waitTill(action) functions, e.g.: commit() -> waitTillCommitted()"
	 */
	async waitForCommitConfirmation(swapId: string): Promise<{
		success: boolean;
		message: string;
		finalState?: number;
	}> {
		try {
			if (!swapId) {
				return {
					success: false,
					message: 'Swap ID is required'
				};
			}

			const swap = this.services.swapRegistry?.getSwap(swapId);
			if (!swap) {
				return {
					success: false,
					message: 'Swap not found or expired'
				};
			}

			const initialState = swap.getState();
			logger.info('Starting waitTillCommitted for swap', {
				swapId,
				initialState
			});

			// Use the proper Atomiq SDK method to wait for commit confirmation
			try {
				await swap.waitTillCommited();
				const finalState = swap.getState();

				logger.info('waitTillCommitted completed successfully', {
					swapId,
					initialState,
					finalState
				});

				return {
					success: true,
					message: `Commit confirmed by Atomiq SDK. State: ${initialState} → ${finalState}`,
					finalState
				};
			} catch (waitError) {
				const currentState = swap.getState();
				logger.warn('waitTillCommitted failed, but checking final state', {
					swapId,
					initialState,
					currentState,
					error: waitError instanceof Error ? waitError.message : 'Unknown error'
				});

				// Even if waitTillCommitted fails, the commit might have succeeded
				// Check if the state has changed to a committed state
				if (currentState !== initialState && currentState >= 1) {
					logger.info('Commit appears successful despite waitTillCommitted failure', {
						swapId,
						finalState: currentState
					});

					return {
						success: true,
						message: `Commit likely successful. State changed: ${initialState} → ${currentState}`,
						finalState: currentState
					};
				}

				throw waitError;
			}
		} catch (error) {
			logger.error('Failed to wait for commit confirmation', error as Error, {
				swapId
			});

			return {
				success: false,
				message: `Commit confirmation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
			};
		}
	}

	/**
	 * Wait for claim confirmation using Atomiq SDK waitTillClaimed method
	 * According to Atomiq docs: claim() -> waitTillClaimed()
	 */
	async waitForClaimConfirmation(swapId: string): Promise<{
		success: boolean;
		message: string;
		finalState?: number;
	}> {
		try {
			if (!swapId) {
				return {
					success: false,
					message: 'Swap ID is required'
				};
			}

			const swap = this.services.swapRegistry?.getSwap(swapId);
			if (!swap) {
				return {
					success: false,
					message: 'Swap not found or expired'
				};
			}

			const initialState = swap.getState();
			logger.info('Starting waitTillClaimed for swap', {
				swapId,
				initialState
			});

			// Use the proper Atomiq SDK method to wait for claim confirmation
			try {
				await swap.waitTillClaimed();
				const finalState = swap.getState();

				logger.info('waitTillClaimed completed successfully', {
					swapId,
					initialState,
					finalState
				});

				return {
					success: true,
					message: `Claim confirmed by Atomiq SDK. State: ${initialState} → ${finalState}`,
					finalState
				};
			} catch (waitError) {
				const currentState = swap.getState();
				logger.warn('waitTillClaimed failed, but checking final state', {
					swapId,
					initialState,
					currentState,
					error: waitError instanceof Error ? waitError.message : 'Unknown error'
				});

				// Even if waitTillClaimed fails, the claim might have succeeded
				// Check if the state has changed to a claimed state (typically state 3+)
				if (currentState !== initialState && currentState >= 3) {
					logger.info('Claim appears successful despite waitTillClaimed failure', {
						swapId,
						finalState: currentState
					});

					return {
						success: true,
						message: `Claim likely successful. State changed: ${initialState} → ${currentState}`,
						finalState: currentState
					};
				}

				throw waitError;
			}
		} catch (error) {
			logger.error('Failed to wait for claim confirmation', error as Error, {
				swapId
			});

			return {
				success: false,
				message: `Claim confirmation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
			};
		}
	}

	/**
	 * Get current swap state
	 */
	async getSwapState(swapId: string): Promise<{
		success: boolean;
		message: string;
		state?: number;
	}> {
		try {
			if (!swapId) {
				return {
					success: false,
					message: 'Swap ID is required'
				};
			}

			const swap = this.services.swapRegistry?.getSwap(swapId);
			if (!swap) {
				return {
					success: false,
					message: 'Swap not found or expired'
				};
			}

			const currentState = swap.getState();
			logger.info('Retrieved swap state', {
				swapId,
				state: currentState
			});

			return {
				success: true,
				message: `Swap state: ${currentState}`,
				state: currentState
			};
		} catch (error) {
			logger.error('Failed to get swap state', error as Error, {
				swapId
			});

			return {
				success: false,
				message: `Failed to get swap state: ${error instanceof Error ? error.message : 'Unknown error'}`
			};
		}
	}
}
