/**
 * Fee Transaction Utilities
 *
 * Utilities for creating and calculating fee transactions in swap operations.
 * Fees are applied as a percentage of the swap amount and transferred to a
 * configured recipient address.
 */

import { FEE_CONFIG } from '$lib/constants/blockchain.constants';
import type { StarknetTx } from '$lib/types/atomiq-starknet';

/**
 * Calculate the fee amount based on swap amount and fee percentage
 * @param swapAmount - The total swap amount as a bigint
 * @param feePercentage - The fee percentage as a decimal (e.g., 0.0001 for 0.01%)
 * @returns The calculated fee amount as a bigint
 */
export function calculateFeeAmount(swapAmount: bigint, feePercentage: number): bigint {
	// Convert percentage to basis points to maintain precision
	const feeAmount = (swapAmount * BigInt(Math.floor(feePercentage * 1000000))) / BigInt(1000000);
	return feeAmount;
}

/**
 * Create a fee transaction for transferring the calculated fee amount
 * @param tokenAddress - The ERC-20 token contract address
 * @param feeAmount - The fee amount to transfer (in token decimals)
 * @param recipientAddress - The address to receive the fee
 * @returns A properly formatted Starknet transaction for the fee transfer
 */
export function createFeeTransaction(
	tokenAddress: string,
	feeAmount: bigint,
	recipientAddress: string
): StarknetTx {
	return {
		type: 'INVOKE',
		tx: [
			{
				contractAddress: tokenAddress,
				entrypoint: 'transfer',
				calldata: [
					recipientAddress, // recipient address
					feeAmount.toString(10), // amount (low part)
					'0x0' // amount (high part, 0 for amounts < 2^128)
				]
			}
		],
		details: {
			description: `Fee transaction: ${feeAmount.toString()} tokens (${(FEE_CONFIG.PERCENTAGE * 100).toFixed(2)}%)`,
			feeAmount: feeAmount.toString(),
			feePercentage: FEE_CONFIG.PERCENTAGE,
			recipient: recipientAddress,
			tokenAddress,
			transactionType: 'fee'
		}
	};
}

/**
 * Create a fee call for use in multicall transactions
 * @param tokenAddress - The ERC-20 token contract address
 * @param feeAmount - The fee amount to transfer (in token decimals)
 * @param recipientAddress - The address to receive the fee
 * @returns A Call object for use in multicall transactions
 */
export function createFeeCall(tokenAddress: string, feeAmount: bigint, recipientAddress: string) {
	return {
		contractAddress: tokenAddress,
		entrypoint: 'transfer',
		calldata: [
			recipientAddress, // recipient address
			feeAmount.toString(10), // amount (low part)
			'0x0' // amount (high part, 0 for amounts < 2^128)
		]
	};
}

/**
 * Create a fee call using the default configuration
 * @param tokenAddress - The ERC-20 token contract address
 * @param swapAmount - The total swap amount to calculate fee from
 * @returns A Call object for use in multicall transactions
 */
export function createDefaultFeeCall(tokenAddress: string, swapAmount: bigint) {
	const feeAmount = calculateFeeAmount(swapAmount, FEE_CONFIG.PERCENTAGE);
	return createFeeCall(tokenAddress, feeAmount, FEE_CONFIG.RECIPIENT_ADDRESS);
}

/**
 * Create a fee transaction using the default configuration
 * @param tokenAddress - The ERC-20 token contract address
 * @param swapAmount - The total swap amount to calculate fee from
 * @returns A properly formatted Starknet transaction for the fee transfer
 */
export function createDefaultFeeTransaction(tokenAddress: string, swapAmount: bigint): StarknetTx {
	const feeAmount = calculateFeeAmount(swapAmount, FEE_CONFIG.PERCENTAGE);
	return createFeeTransaction(tokenAddress, feeAmount, FEE_CONFIG.RECIPIENT_ADDRESS);
}

/**
 * Extract swap amount from SDK transaction calldata
 * This function attempts to extract the amount from typical ERC-20 transfer calls
 * @param sdkTransactions - Array of SDK transactions
 * @returns The detected swap amount as bigint, or null if not found
 */
export function extractSwapAmountFromTransactions(sdkTransactions: any[]): bigint | null {
	for (const sdkTx of sdkTransactions) {
		if (sdkTx.type === 'INVOKE' && Array.isArray(sdkTx.tx)) {
			for (const call of sdkTx.tx) {
				// Look for ERC-20 transfer or other token operations
				if (
					call.entrypoint === 'transfer' ||
					call.entrypoint === 'transferFrom' ||
					call.entrypoint === 'approve'
				) {
					try {
						// Amount is typically the second parameter in calldata (index 1)
						// For transfer: [recipient, amount_low, amount_high]
						if (call.calldata && call.calldata.length >= 2) {
							const amountLow = call.calldata[1];
							const amountHigh = call.calldata[2] || '0x0';

							// Combine low and high parts (Starknet uses u256 split into u128 parts)
							const amount = BigInt(amountLow) + (BigInt(amountHigh) << BigInt(128));
							return amount;
						}
					} catch (error) {
						// Continue searching if this call doesn't contain valid amount data
						continue;
					}
				}
			}
		}
	}

	return null;
}
