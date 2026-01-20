import type { StarknetTransactionDetails, StarknetTx } from '$lib/types/atomiq-starknet';

export interface UnsignedTransaction {
	type: string;
	tx: StarknetTx;
	details?: StarknetTransactionDetails;
}

export interface SignedTransaction {
	type: string;
	txHash: string;
	signature?: any; // WebAuthn signature for paymaster transactions
	tx: StarknetTx;
	details?: StarknetTransactionDetails;
}

export interface TransactionPhase {
	success: boolean;
	phase: 'commit' | 'claim' | 'commit-and-claim';
	transactions: UnsignedTransaction[];
	message: string;
}

export interface ClaimResult {
	success: boolean;
	txHash?: string;
	message: string;
}

export interface GasEstimation {
	estimatedGasFee: bigint;
	resourceBounds: {
		l1_gas: {
			max_amount: string;
			max_price_per_unit: string;
		};
		l2_gas: {
			max_amount: string;
			max_price_per_unit: string;
		};
	};
}
