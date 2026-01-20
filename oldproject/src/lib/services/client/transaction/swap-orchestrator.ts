import type { UserWithCredentials } from '$lib/services/client/auth.service';
import { logger } from '$lib/utils/logger';
import { TransactionApiService } from './api-service';
import { TransactionSigner } from './signer';
import type { ClaimResult } from './types';
import { criticalFlow } from '$lib/stores/navigation-guard';

/**
 * Swap orchestrator responsible for coordinating the complete
 * Lightning swap claiming workflow
 */
export class SwapOrchestrator {
	private apiService = new TransactionApiService();
	private signer = new TransactionSigner();

	/**
	 * Execute complete Lightning swap claim with client-side signing
	 */
	async claimLightningSwapWithClientSigning(_swapId: string): Promise<ClaimResult> {
		return {
			success: false,
			message: 'Manual signing is disabled. Paymaster-only is enforced.'
		};
	}

	/**
	 * Execute complete Lightning swap claim with paymaster support
	 */
	async claimLightningSwapWithPaymaster(
		swapId: string,
		user: UserWithCredentials
	): Promise<ClaimResult> {
		return this.claimLightningSwap(swapId, true, user);
	}

	/**
	 * Execute complete Lightning swap claim with optional paymaster support
	 */
	private async claimLightningSwap(
		swapId: string,
		_usePaymaster: boolean = true,
		user: UserWithCredentials | null = null
	): Promise<ClaimResult> {
		// Lock navigation across the entire commit→claim sequence
		criticalFlow.set({ active: true, reason: 'ln-claim-sequence', since: Date.now() });
		try {
			logger.info('Starting Lightning swap claim', {
				swapId,
				usePaymaster: true,
				hasUser: !!user
			});

			// Step 1: Get unsigned transactions
			const unsignedTxns = await this.apiService.getUnsignedTransactions(swapId);

			if (!unsignedTxns.success) {
				return {
					success: false,
					message: unsignedTxns.message
				};
			}

			// Step 2: Execute transactions with paymaster (enforced)
			if (!user) {
				return {
					success: false,
					message: 'Passkey required: missing WebAuthn credentials'
				};
			}
			let result: ClaimResult = await this.executeWithPaymaster(
				swapId,
				unsignedTxns.transactions,
				unsignedTxns.phase,
				user
			);

			// Step 3: If it was a two-step process and we only did commit, do claim
			if (unsignedTxns.phase === 'commit' && result.success) {
				logger.info('Commit phase completed, waiting for Atomiq SDK confirmation', {
					swapId,
					usePaymaster: true,
					commitTxHash: result.txHash
				});

				// Step 3a: Use proper Atomiq SDK workflow - wait for commit confirmation
				logger.info('Calling Atomiq SDK waitTillCommited() via server endpoint', {
					swapId
				});

				try {
					const waitResponse = await fetch(`/api/lightning/wait-commit-confirmation/${swapId}`, {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json'
						}
					});

					if (!waitResponse.ok) {
						const errorData = await waitResponse.json();
						logger.error('Atomiq SDK commit confirmation failed', undefined, {
							swapId,
							status: waitResponse.status,
							errorMessage: errorData.message || 'Unknown error'
						});
						return {
							success: false,
							message: `Commit confirmation failed: ${errorData.message || 'Unknown error'}`
						};
					}

					const waitResult = await waitResponse.json();
					logger.info('Atomiq SDK commit confirmation completed', {
						swapId,
						finalState: waitResult.finalState,
						confirmedAt: waitResult.confirmedAt
					});

					// Add buffer delay after waitTillCommited() to allow state propagation
					logger.info('Adding buffer delay for state synchronization', {
						swapId,
						bufferDelayMs: 3000
					});
					await new Promise((resolve) => setTimeout(resolve, 3000));

					// Verify swap state is ready for claim phase
					logger.info('Verifying swap state after commit confirmation', {
						swapId
					});
					try {
						const stateVerifyResponse = await fetch(`/api/lightning/verify-swap-state/${swapId}`, {
							method: 'GET',
							headers: {
								'Content-Type': 'application/json'
							}
						});
						if (stateVerifyResponse.ok) {
							const stateInfo = await stateVerifyResponse.json();
							logger.info('Swap state verification completed', {
								swapId,
								currentState: stateInfo.state,
								readyForClaim: stateInfo.readyForClaim
							});
						} else {
							logger.warn('Swap state verification failed, continuing anyway', {
								swapId,
								status: stateVerifyResponse.status
							});
						}
					} catch (stateError) {
						logger.warn('State verification error, continuing anyway', {
							swapId,
							error: stateError instanceof Error ? stateError.message : 'Unknown error'
						});
					}
				} catch (waitError) {
					logger.error(
						'Error during Atomiq SDK commit confirmation',
						waitError instanceof Error ? waitError : undefined,
						{ swapId }
					);
					return {
						success: false,
						message: `Commit confirmation error: ${waitError instanceof Error ? waitError.message : 'Unknown error'}`
					};
				}

				// Step 3b: Execute claim phase with retry logic for 'Not committed' errors
				return await this.executeClaimPhaseWithRetry(swapId, user);
			}

			return result;
		} catch (error) {
			const errorMsg = (error as Error).message;
			const isNotCommittedError =
				errorMsg.includes('Not committed') || errorMsg.includes('_finalize: Not committed');

			logger.error('Lightning swap claim failed', error as Error, {
				swapId,
				usePaymaster: true,
				hasUser: !!user,
				errorType: isNotCommittedError ? 'timing_issue' : 'general_error',
				isRetryable: isNotCommittedError,
				errorMessage: errorMsg
			});

			const userMessage = isNotCommittedError
				? `Lightning swap claim failed due to timing issue: ${errorMsg}. This may succeed on retry.`
				: `Lightning swap claim failed: ${errorMsg}`;

			return {
				success: false,
				message: userMessage
			};
		} finally {
			// Always release the critical flow lock
			criticalFlow.set({ active: false });
		}
	}

	/**
	 * Execute claim phase with retry logic for 'Not committed' errors
	 */
	private async executeClaimPhaseWithRetry(
		swapId: string,
		user: UserWithCredentials,
		maxRetries: number = 3,
		baseDelayMs: number = 2000
	): Promise<ClaimResult> {
		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				logger.info(`Claim attempt ${attempt}/${maxRetries}`, {
					swapId,
					usePaymaster: true,
					attempt
				});

				// Fetch claim transactions
				const claimTxns = await this.apiService.getUnsignedTransactions(swapId);

				if (!claimTxns.success) {
					if (attempt === maxRetries) {
						return {
							success: false,
							message: `Failed to get claim transactions after ${maxRetries} attempts: ${claimTxns.message}`
						};
					}

					// If fetching transactions failed, wait and retry
					const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
					logger.info('Retrying claim transaction fetch', {
						swapId,
						attempt,
						nextAttemptIn: delayMs,
						error: claimTxns.message
					});
					await new Promise((resolve) => setTimeout(resolve, delayMs));
					continue;
				}

				// If backend still reports commit phase, wait and retry until claim is available
				if (claimTxns.phase !== 'claim') {
					const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
					logger.info('Backend not ready for claim yet (phase != claim). Retrying...', {
						swapId,
						attempt,
						reportedPhase: claimTxns.phase,
						nextAttemptIn: delayMs
					});
					await new Promise((resolve) => setTimeout(resolve, delayMs));
					continue;
				}

				// Execute claim transactions with paymaster (enforced)
				const result: ClaimResult = await this.executeWithPaymaster(
					swapId,
					claimTxns.transactions,
					'claim',
					user
				);

				// Check if claim succeeded
				if (result.success) {
					logger.info('Claim phase completed successfully', {
						swapId,
						attempt,
						txHash: result.txHash
					});
					return result;
				}

				// Check if this is a 'Not committed' error that might resolve with retry
				const isNotCommittedError =
					result.message &&
					(result.message.includes('Not committed') ||
						result.message.includes('_finalize: Not committed'));

				if (isNotCommittedError && attempt < maxRetries) {
					const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
					logger.info('Retrying claim due to "Not committed" error', {
						swapId,
						attempt,
						nextAttemptIn: delayMs,
						error: result.message
					});
					await new Promise((resolve) => setTimeout(resolve, delayMs));
					continue;
				}

				// If this is the last attempt or not a retryable error, return the failure
				return result;
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : 'Unknown error';
				logger.error(
					`Claim attempt ${attempt} failed`,
					error instanceof Error ? error : undefined,
					{ swapId, attempt }
				);

				if (attempt === maxRetries) {
					return {
						success: false,
						message: `Claim failed after ${maxRetries} attempts: ${errorMsg}`
					};
				}

				// Wait before next attempt
				const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
				await new Promise((resolve) => setTimeout(resolve, delayMs));
			}
		}

		// This should never be reached, but just in case
		return {
			success: false,
			message: 'Claim retry logic completed without result'
		};
	}

	/**
	 * Execute transactions using paymaster (gasless) - Client-side signing with server-side execution
	 */
	private async executeWithPaymaster(
		swapId: string,
		transactions: any[],
		phase: string,
		user: UserWithCredentials
	): Promise<ClaimResult> {
		try {
			logger.info('Executing transactions with client-side signing + server-side paymaster', {
				swapId,
				phase,
				transactionCount: transactions.length
			});

			if (!user.webauthnCredentials) {
				throw new Error('User missing WebAuthn credentials for paymaster');
			}

			// Step 1: Build paymaster transaction to get typedData
			logger.info('Step 1: Building paymaster transaction to get typedData', {
				swapId,
				phase,
				transactionCount: transactions.length
			});

			const { AvnuService } = await import('$lib/services/client/avnu.client.service');
			const avnuService = AvnuService.getInstance();

			// Extract the first transaction for execution (assuming single transaction for now)
			const transaction = transactions[0];
			if (!transaction) {
				throw new Error('No transaction to execute');
			}

			// Debug: Log the transaction structure
			logger.info('Transaction structure for paymaster build', {
				swapId,
				phase,
				transactionKeys: Object.keys(transaction),
				transactionType: typeof transaction,
				hasCalls: !!transaction.calls,
				callsType: typeof transaction.calls,
				callsLength: Array.isArray(transaction.calls) ? transaction.calls.length : 'not array',
				fullTransaction: transaction
			});

			// Extract calls from the transaction - handle different possible structures
			let calls: any[] = [];

			if (transaction.calls && Array.isArray(transaction.calls)) {
				// Direct calls array
				calls = transaction.calls;
			} else if (transaction.tx && Array.isArray(transaction.tx)) {
				// Calls are in the tx array - convert to proper format
				calls = transaction.tx.map((call: any) => ({
					to: call.contractAddress,
					selector: call.entrypoint,
					calldata: call.calldata || []
				}));
			} else if (transaction.invoke && Array.isArray(transaction.invoke.calls)) {
				// Calls are in invoke.calls
				calls = transaction.invoke.calls;
			} else {
				// Fallback: treat the entire transaction as a single call
				calls = [
					{
						to: transaction.contractAddress || transaction.to,
						selector: transaction.entrypoint || transaction.selector,
						calldata: transaction.calldata || []
					}
				];
			}

			// Validate that we have valid calls
			if (!calls || calls.length === 0) {
				throw new Error('No valid calls found in transaction');
			}

			// Ensure each call has required fields
			calls = calls.map((call, index) => {
				// More robust validation for contract address
				const contractAddress = call.contractAddress || call.to;
				if (
					!contractAddress ||
					typeof contractAddress !== 'string' ||
					contractAddress.trim() === ''
				) {
					logger.error(`Call ${index} has invalid contract address`, undefined, {
						call,
						contractAddress,
						hasContractAddress: !!call.contractAddress,
						hasTo: !!call.to,
						contractAddressType: typeof contractAddress
					});
					throw new Error(`Call ${index} has invalid contract address: ${contractAddress}`);
				}

				// More robust validation for entrypoint
				const entrypoint = call.entrypoint || call.selector;
				if (!entrypoint || typeof entrypoint !== 'string' || entrypoint.trim() === '') {
					logger.error(`Call ${index} has invalid entrypoint`, undefined, {
						call,
						entrypoint,
						hasEntrypoint: !!call.entrypoint,
						hasSelector: !!call.selector,
						entrypointType: typeof entrypoint
					});
					throw new Error(`Call ${index} has invalid entrypoint: ${entrypoint}`);
				}

				// Return in Starknet.js format for consistency with the build step
				const formattedCall = {
					contractAddress: contractAddress.trim(),
					entrypoint: entrypoint.trim(),
					calldata: call.calldata || []
				};

				logger.info(`Call ${index} validated and formatted`, {
					original: call,
					formatted: formattedCall
				});

				return formattedCall;
			});

			logger.info('Extracted calls for paymaster build', {
				swapId,
				phase,
				callCount: calls.length,
				sampleCall: calls[0],
				callsStructure: calls.map((call, index) => ({
					index,
					keys: Object.keys(call),
					hasContractAddress: !!call.contractAddress,
					hasEntrypoint: !!call.entrypoint
				}))
			});

			// Build the paymaster transaction to get typedData
			const buildResponse = await avnuService.buildPaymasterTransaction({
				accountAddress: user.starknetAddress!,
				calls,
				paymentMethod: 'PAYMASTER_SPONSORED' as any
			});

			if (!buildResponse.typedData) {
				throw new Error('Failed to get typedData from paymaster build');
			}

			logger.info('Paymaster transaction built successfully', {
				swapId,
				phase,
				hasTypedData: !!buildResponse.typedData,
				callCount: calls.length
			});

			// Step 2: Sign the typed data client-side using WebAuthn
			logger.info('Step 2: Signing typed data with WebAuthn', {
				swapId,
				phase,
				transactionCount: transactions.length
			});

			const signedTransactions = await this.signer.signTransactions(
				transactions,
				swapId,
				true, // signOnly: true for paymaster transactions
				buildResponse.typedData // Pass SNIP-9 typed data for outside execution
			);

			logger.info('Client-side signing completed successfully', {
				swapId,
				phase,
				signedTransactionCount: signedTransactions.length,
				signedTxHashes: signedTransactions.map((tx) => tx.txHash)
			});

			// Step 3: Execute the signed transaction using paymaster
			logger.info('Step 3: Executing signed transaction with paymaster', {
				swapId,
				phase,
				signedTransactionCount: signedTransactions.length,
				userAddress: user.starknetAddress
			});

			const signedTransaction = signedTransactions[0];
			if (!signedTransaction) {
				throw new Error('No signed transaction to execute');
			}

			// Execute using the proper paymaster service
			// Use the calls from the signed transaction structure
			const executionCalls = signedTransaction.tx?.tx || calls;

			logger.info('Executing paymaster transaction with calls', {
				swapId,
				phase,
				callCount: executionCalls.length,
				callsSource: signedTransaction.tx?.tx ? 'signedTransaction.tx.tx' : 'original',
				sampleCall: executionCalls[0],
				hasTxHash: !!signedTransaction.txHash,
				hasTypedData: !!buildResponse.typedData,
				signedTransactionKeys: Object.keys(signedTransaction),
				txKeys: signedTransaction.tx ? Object.keys(signedTransaction.tx) : [],
				signatureDebug: {
					hasSignature: !!signedTransaction.signature,
					signatureType: typeof signedTransaction.signature,
					signatureKeys: signedTransaction.signature
						? Object.keys(signedTransaction.signature)
						: [],
					signatureValue: signedTransaction.signature
				}
			});

			// For paymaster transactions, we need the actual WebAuthn signature, not the transaction hash
			// The signature should come from the WebAuthn signing process
			if (!signedTransaction.signature) {
				throw new Error('WebAuthn signature is required for paymaster transactions');
			}

			const result = await avnuService.executeSignedPaymasterTransaction({
				accountAddress: user.starknetAddress!,
				calls: executionCalls,
				signature: signedTransaction.signature, // Use the actual WebAuthn signature
				typedData: buildResponse.typedData, // Use the typedData from build step
				paymentMethod: 'PAYMASTER_SPONSORED' as any
			});

			logger.info('Paymaster transaction executed successfully', {
				swapId,
				phase,
				transactionHash: result.transactionHash
			});

			// Step 4: Wait for Atomiq SDK event notification (if this is a commit or claim phase)
			if (phase === 'commit') {
				logger.info('Waiting for Atomiq SDK commit confirmation after paymaster execution', {
					swapId,
					transactionHash: result.transactionHash
				});

				try {
					const waitResponse = await fetch(`/api/lightning/wait-commit-confirmation/${swapId}`, {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json'
						}
					});

					if (!waitResponse.ok) {
						const errorData = await waitResponse.json();
						logger.warn('Atomiq SDK commit confirmation failed after paymaster execution', {
							swapId,
							status: waitResponse.status,
							error: errorData.message || 'Unknown error',
							transactionHash: result.transactionHash
						});
						// Don't fail the entire operation, just log the warning
					} else {
						const waitResult = await waitResponse.json();
						logger.info('Atomiq SDK commit confirmation completed after paymaster execution', {
							swapId,
							finalState: waitResult.finalState,
							confirmedAt: waitResult.confirmedAt,
							transactionHash: result.transactionHash
						});
					}
				} catch (waitError) {
					logger.warn('Error during Atomiq SDK commit confirmation after paymaster execution', {
						swapId,
						error: waitError instanceof Error ? waitError.message : 'Unknown error',
						transactionHash: result.transactionHash
					});
					// Don't fail the entire operation, just log the warning
				}
			} else if (phase === 'claim') {
				logger.info('Waiting for Atomiq SDK claim confirmation after paymaster execution', {
					swapId,
					transactionHash: result.transactionHash
				});

				try {
					const waitResponse = await fetch(`/api/lightning/wait-claim-confirmation/${swapId}`, {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json'
						}
					});

					if (!waitResponse.ok) {
						const errorData = await waitResponse.json();
						logger.warn('Atomiq SDK claim confirmation failed after paymaster execution', {
							swapId,
							status: waitResponse.status,
							error: errorData.message || 'Unknown error',
							transactionHash: result.transactionHash
						});
						// Don't fail the entire operation, just log the warning
					} else {
						const waitResult = await waitResponse.json();
						logger.info('Atomiq SDK claim confirmation completed after paymaster execution', {
							swapId,
							finalState: waitResult.finalState,
							confirmedAt: waitResult.confirmedAt,
							transactionHash: result.transactionHash
						});
					}
				} catch (waitError) {
					logger.warn('Error during Atomiq SDK claim confirmation after paymaster execution', {
						swapId,
						error: waitError instanceof Error ? waitError.message : 'Unknown error',
						transactionHash: result.transactionHash
					});
					// Don't fail the entire operation, just log the warning
				}
			}

			return {
				success: true,
				message: `Paymaster transaction executed successfully: ${result.transactionHash}`,
				txHash: result.transactionHash
			};
		} catch (error) {
			logger.error(
				'Paymaster execution failed',
				error instanceof Error ? error : undefined,
				{ swapId, phase }
			);

			return {
				success: false,
				message: `Paymaster execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
			};
		}
	}
}
