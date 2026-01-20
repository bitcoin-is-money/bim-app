/**
 * @fileoverview Starknet Utilities for Atomiq Service
 *
 * This file contains utilities for Starknet account management,
 * transaction execution, and validation used by the Atomiq services.
 *
 * @author bim
 * @version 1.0.0
 */

import { AVNU_CONFIG } from '$lib/config/avnu.config';
import { AVNU_SERVER_CONFIG } from '$lib/config/avnu-server.config';
import { PublicEnv } from '$lib/config/env';
import { ServerPrivateEnv } from '$lib/config/server';
import { logger } from '$lib/utils/logger';
import { Account, PaymasterRpc, RpcProvider, type Call, type ExecutionParameters } from 'starknet';
import type { AtomiqConfig } from './types';
import type { SignedTransaction } from '$lib/services/client/transaction/types';

/**
 * Executes a single transaction with proper error handling
 */
export async function executeTransaction(
	tx: any,
	starknetSigner: any,
	swapId: string,
	phase: string,
	config: AtomiqConfig
): Promise<string | undefined> {
	try {
		logger.info(`Executing ${phase} transaction`, {
			swapId,
			txType: tx.type,
			hasDetails: !!tx.details
		});

		// Create account if we have a WebAuthn owner instead of an account
		let account = starknetSigner;
		if (!starknetSigner.execute && !starknetSigner.account) {
			throw new Error('Invalid Starknet signer: missing execute/account method');
		} else if (starknetSigner.account) {
			account = starknetSigner.account;
		}

		if (tx.type === 'INVOKE') {
			// Sanitize execution details: never pass a null/undefined nonce; let starknet.js fetch it
			let execDetails = tx.details || {};
			if (execDetails && Object.prototype.hasOwnProperty.call(execDetails, 'nonce')) {
				if (execDetails.nonce === null || execDetails.nonce === undefined) {
					const { nonce, ...rest } = execDetails;
					execDetails = rest;
					logger.info('Removed null/undefined nonce from execution details', { swapId, phase });
				}
			}

			const result = await account.execute(tx.tx, execDetails);
			logger.info(`${phase} INVOKE transaction executed`, {
				swapId,
				txHash: result.transaction_hash
			});
			return result.transaction_hash;
		} else if (tx.type === 'DEPLOY_ACCOUNT') {
			const result = await account.deployAccount(tx.tx, tx.details);
			logger.info(`${phase} DEPLOY_ACCOUNT transaction executed`, {
				swapId,
				txHash: result.transaction_hash
			});
			return result.transaction_hash;
		} else {
			logger.warn('Unknown transaction type encountered', {
				swapId,
				txType: tx.type,
				phase
			});
			return undefined;
		}
	} catch (error) {
		logger.error(`Transaction execution failed in ${phase}`, error as Error, {
			swapId,
			txType: tx.type
		});
		throw error;
	}
}

/**
 * Validates transaction against official Atomiq SDK StarknetTx structure
 * Based on: https://github.com/atomiqlabs/atomiq-chain-starknet/blob/main/src/starknet/chain/modules/StarknetTransactions.ts
 */
export function validateStarknetTxStructure(tx: any): {
	isValid: boolean;
	violations: string[];
} {
	const violations: string[] = [];

	if (!tx || typeof tx !== 'object') {
		violations.push('Transaction is not an object');
		return { isValid: false, violations };
	}

	// Check required fields
	if (!tx.type) {
		violations.push('Missing required field: type');
	} else if (tx.type !== 'INVOKE' && tx.type !== 'DEPLOY_ACCOUNT') {
		violations.push(`Invalid type: ${tx.type}. Expected 'INVOKE' or 'DEPLOY_ACCOUNT'`);
	}

	if (!tx.tx) {
		violations.push('Missing required field: tx');
	} else if (tx.type === 'INVOKE') {
		// For INVOKE transactions, tx should be Array<Call>
		if (!Array.isArray(tx.tx)) {
			violations.push('For INVOKE transactions, tx should be Array<Call>');
		} else {
			// Validate each Call in the array
			tx.tx.forEach((call: any, index: number) => {
				if (!call || typeof call !== 'object') {
					violations.push(`Call[${index}] is not an object`);
				} else {
					if (typeof call.contractAddress !== 'string') {
						violations.push(`Call[${index}].contractAddress should be string`);
					}
					if (typeof call.entrypoint !== 'string') {
						violations.push(`Call[${index}].entrypoint should be string`);
					}
					if (!Array.isArray(call.calldata)) {
						violations.push(`Call[${index}].calldata should be array`);
					}
				}
			});
		}
	}

	if (!tx.details || typeof tx.details !== 'object') {
		violations.push('Missing or invalid details object');
	}

	return {
		isValid: violations.length === 0,
		violations
	};
}

/**
 * Executes signed transactions via RPC following Atomiq SDK docs pattern
 * Docs: https://raw.githubusercontent.com/atomiqlabs/atomiq-sdk/refs/heads/master/README.md
 * Pattern: Get unsigned -> Sign -> Execute via RPC -> Wait for confirmation
 * 
 * Note: Signed transactions are paymaster transactions and need to be executed via PaymasterRpc
 */
export async function executeSignedTransactionsViaRpc(
	signedTransactions: SignedTransaction[],
	swapId: string,
	phase: string,
	config: AtomiqConfig
): Promise<{ transaction_hash: string }> {
	try {
		logger.info(`Executing ${signedTransactions.length} signed transaction(s) via RPC`, {
			swapId,
			phase,
			transactionCount: signedTransactions.length
		});

		if (signedTransactions.length === 0) {
			throw new Error('No signed transactions provided');
		}

		// Execute the first transaction (typically there's only one)
		const signedTx = signedTransactions[0];

		if (!signedTx.tx) {
			throw new Error('Signed transaction missing tx data');
		}

		// Extract calls from transaction
		let calls: Call[] = [];
		if (signedTx.type === 'INVOKE') {
			if (Array.isArray(signedTx.tx)) {
				calls = signedTx.tx as Call[];
			} else if ((signedTx.tx as any).tx && Array.isArray((signedTx.tx as any).tx)) {
				calls = (signedTx.tx as any).tx as Call[];
			} else if ((signedTx.tx as any).calls) {
				calls = (signedTx.tx as any).calls;
			} else {
				throw new Error('Invalid INVOKE transaction structure');
			}
		} else {
			throw new Error(`Unsupported transaction type: ${signedTx.type}`);
		}

		// Extract account address
		const accountAddress =
			signedTx.details?.walletAddress ||
			signedTx.details?.senderAddress ||
			(signedTx.tx as any).sender_address;

		if (!accountAddress) {
			throw new Error('Cannot determine account address from signed transaction');
		}

		// Check if this is a paymaster transaction (has signature)
		if (signedTx.signature) {
			// Execute via PaymasterRpc (paymaster transactions)
			logger.info('Executing paymaster transaction via PaymasterRpc', {
				swapId,
				phase,
				accountAddress,
				callCount: calls.length
			});

			// Create PaymasterRpc instance
			const paymasterRpc = new PaymasterRpc({
				nodeUrl: AVNU_CONFIG.API_BASE_URL,
				headers: { 'x-paymaster-api-key': AVNU_SERVER_CONFIG.API_KEY }
			});

			// Rebuild typedData from calls (required for PaymasterRpc)
			// We need to build the transaction to get typedData
			const buildPayload = {
				type: 'invoke' as const,
				invoke: {
					userAddress: accountAddress,
					calls: calls
				}
			};

			const buildParameters: ExecutionParameters = {
				feeMode: { mode: 'sponsored' as const },
				version: '0x1' as const
			};

			// Build transaction to get typedData
			const buildResponse = await paymasterRpc.buildTransaction(buildPayload, buildParameters);
			const typedData = (buildResponse as any).typedData || (buildResponse as any).typed_data;

			if (!typedData) {
				throw new Error('Failed to get typedData from PaymasterRpc.buildTransaction');
			}

			// Execute the signed transaction via PaymasterRpc
			const executePayload = {
				type: 'invoke' as const,
				invoke: {
					userAddress: accountAddress,
					typedData: typedData,
					signature: signedTx.signature
				}
			};

			const executeParameters: ExecutionParameters = {
				feeMode: { mode: 'sponsored' as const },
				version: '0x1' as const
			};

			const result = await paymasterRpc.executeTransaction(executePayload, executeParameters);

			logger.info(`Successfully executed ${phase} paymaster transaction via PaymasterRpc`, {
				swapId,
				phase,
				transactionHash: result.transaction_hash
			});

			return result;
		} else {
			// Execute via regular RPC (non-paymaster transactions)
			logger.info('Executing transaction via regular RPC', {
				swapId,
				phase,
				accountAddress
			});

			// Create RPC provider for server-side execution
			const provider = new RpcProvider({
				nodeUrl: ServerPrivateEnv.STARKNET_RPC_URL(),
				specVersion: PublicEnv.STARKNET_SPEC_VERSION() as '0.9.0'
			});

			// Create account for execution
			const account = new Account(provider, accountAddress, '0x0', '1');

			let result: { transaction_hash: string };

			if (signedTx.type === 'INVOKE') {
				result = await account.execute(calls, signedTx.details || {});
			} else if (signedTx.type === 'DEPLOY_ACCOUNT') {
				result = await account.deployAccount(signedTx.tx as any, signedTx.details || {});
			} else {
				throw new Error(`Unsupported transaction type: ${signedTx.type}`);
			}

			logger.info(`Successfully executed ${phase} transaction via RPC`, {
				swapId,
				phase,
				transactionHash: result.transaction_hash
			});

			return result;
		}
	} catch (error) {
		logger.error(`Failed to execute signed transactions via RPC in ${phase}`, error as Error, {
			swapId,
			phase,
			transactionCount: signedTransactions.length
		});
		throw error;
	}
}

/**
 * Waits for SDK confirmation with timeout
 */
export async function waitWithTimeout(
	waitFunction: () => Promise<any>,
	operation: string,
	swapId: string,
	timeoutMs: number = 300000
): Promise<void> {
	try {
		logger.info(`Starting ${operation}`, { swapId, timeoutMs });

		const timeoutPromise = new Promise((_, reject) => {
			setTimeout(() => {
				reject(new Error(`${operation} timed out after ${timeoutMs}ms`));
			}, timeoutMs);
		});

		await Promise.race([waitFunction(), timeoutPromise]);

		logger.info(`${operation} completed successfully`, { swapId });
	} catch (error) {
		logger.error(`${operation} failed`, error as Error, { swapId });
		throw error;
	}
}
