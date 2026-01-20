import { serviceConfig } from './index';

// Client-safe AVNU configuration (no private env access)
// Uses centralized configuration system
export const AVNU_CONFIG = serviceConfig.getAvnuConfig();

export interface AvnuGasTokenPrice {
	tokenAddress: string;
	tokenSymbol: string;
	gasTokenPrice: string; // Price in wei per gas unit
}

export interface AvnuTypedDataRequest {
	account: string;
	calls: Call[];
	gasTokenAddress?: string; // null for sponsored transactions
	maxGasTokenAmount?: string; // null for sponsored transactions
	classHash?: string; // For account deployment
}

export interface AvnuTypedDataResponse {
	typedData: any;
	outsideExecution: any;
	gasEstimate: {
		gasConsumed: string;
		gasPrice: string;
		overallFee: string;
	};
}

export interface AvnuExecuteRequest {
	account: string;
	signature: string[];
	outsideExecution: any;
}

export interface AvnuExecuteResponse {
	transactionHash: string;
	status: 'pending' | 'success' | 'failed';
}

export type Call = {
	to: string;
	selector: string;
	calldata: string[];
};

export enum PaymentMethod {
	SELF_PAY = 'self',
	PAYMASTER_SPONSORED = 'paymaster'
}
