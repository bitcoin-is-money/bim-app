/**
 * Atomiq Starknet Transaction Types
 *
 * This file imports and re-exports transaction types from the Atomiq chain-starknet package
 * to provide proper TypeScript support for Starknet transactions in the application.
 */

// Import types from the Atomiq chain-starknet package
import type { StarknetTx } from '@atomiqlabs/chain-starknet/dist/starknet/chain/modules/StarknetTransactions';

// Re-export the main transaction type
export type { StarknetTx };

// Additional type exports for convenience
export type StarknetInvokeTx = Extract<StarknetTx, { type: 'INVOKE' }>;
export type StarknetDeployAccountTx = Extract<StarknetTx, { type: 'DEPLOY_ACCOUNT' }>;

// Helper type to check if a transaction is an invoke transaction
export function isInvokeTransaction(tx: StarknetTx): tx is StarknetInvokeTx {
	return tx.type === 'INVOKE';
}

// Helper type to check if a transaction is a deploy account transaction
export function isDeployAccountTransaction(tx: StarknetTx): tx is StarknetDeployAccountTx {
	return tx.type === 'DEPLOY_ACCOUNT';
}

// Type for transaction details
export type StarknetTransactionDetails = StarknetTx['details'];

// Type for transaction status
export type StarknetTransactionStatus =
	| 'pending'
	| 'success'
	| 'not_found'
	| 'reverted'
	| 'rejected';
