/**
 * Example usage of Atomiq Starknet Transaction Types
 *
 * This file demonstrates how to use the imported types from the Atomiq chain-starknet package.
 */

import type { StarknetDeployAccountTx, StarknetInvokeTx, StarknetTx } from './atomiq-starknet';

// Example function that accepts a properly typed Starknet transaction
export function processStarknetTransaction(tx: StarknetTx): string {
	if (tx.type === 'INVOKE') {
		// TypeScript knows this is an invoke transaction
		const invokeTx: StarknetInvokeTx = tx;
		console.log('Processing invoke transaction with', invokeTx.tx.length, 'calls');
		return `INVOKE: ${invokeTx.tx.length} calls`;
	} else if (tx.type === 'DEPLOY_ACCOUNT') {
		// TypeScript knows this is a deploy account transaction
		const deployTx: StarknetDeployAccountTx = tx;
		console.log('Processing deploy account transaction');
		return 'DEPLOY_ACCOUNT';
	}

	return 'UNKNOWN';
}

// Example function that creates a properly typed transaction
export function createInvokeTransaction(
	calls: Array<{
		contractAddress: string;
		entrypoint: string;
		calldata: any[];
	}>,
	details: any
): StarknetTx {
	return {
		type: 'INVOKE',
		tx: calls,
		details: details
	};
}

// Example function that creates a deploy account transaction
export function createDeployAccountTransaction(payload: any, details: any): StarknetTx {
	return {
		type: 'DEPLOY_ACCOUNT',
		tx: payload,
		details: details
	};
}

// Example of type-safe transaction processing
export function validateTransaction(tx: any): tx is StarknetTx {
	return tx && (tx.type === 'INVOKE' || tx.type === 'DEPLOY_ACCOUNT') && tx.tx && tx.details;
}
