import { AVNU_CONFIG, PaymentMethod } from '$lib/config/avnu.config';
import { PaymasterRpc } from 'starknet';

export interface GasPrice {
	l1_gas: string;
	l2_gas: string;
	l1_data_gas: string;
}

export interface PaymasterStatus {
	available: boolean;
	error?: string;
}

export interface PaymasterTransactionRequest {
	accountAddress: string;
	calls: any[];
	paymentMethod: PaymentMethod;
}

export interface PaymasterTransactionResponse {
	transactionHash: string;
}

export interface PaymasterBuildResponse {
	typedData: any;
	transaction: any;
	calls: any[];
}

export class AvnuService {
	private static instance: AvnuService;
	private cache = new Map<string, any>();

	private constructor() {}

	static getInstance(): AvnuService {
		if (!AvnuService.instance) {
			AvnuService.instance = new AvnuService();
		}
		return AvnuService.instance;
	}

	createPaymasterRpc(): PaymasterRpc {
		return new PaymasterRpc({
			nodeUrl: AVNU_CONFIG.API_BASE_URL
		});
	}

	async checkPaymasterStatus(paymentMethod: PaymentMethod): Promise<PaymasterStatus> {
		const cacheKey = `paymaster-status-${paymentMethod}`;
		const cached = this.cache.get(cacheKey);

		if (cached && Date.now() - cached.timestamp < 60000) {
			// 1 minute cache
			return cached.status;
		}

		try {
			switch (paymentMethod) {
				case PaymentMethod.PAYMASTER_SPONSORED:
					// Check if sponsored paymaster is available
					const status = { available: true };

					this.cache.set(cacheKey, {
						status,
						timestamp: Date.now()
					});

					return status;

				default:
					return { available: false, error: 'Unknown payment method' };
			}
		} catch (error) {
			console.error('Error checking paymaster status:', error);
			return {
				available: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	/**
	 * Build a transaction for paymaster execution
	 * This returns the typed data that the client needs to sign
	 */
	async buildPaymasterTransaction(
		params: PaymasterTransactionRequest
	): Promise<PaymasterBuildResponse> {
		const { accountAddress, calls, paymentMethod } = params;

		try {
			const response = await fetch('/api/avnu/build-paymaster-transaction', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					accountAddress,
					calls,
					paymentMethod
				})
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || `Server error: ${response.status}`);
			}

			const result = await response.json();
			return result;
		} catch (error) {
			console.error('Failed to build paymaster transaction:', error);
			throw error;
		}
	}

	/**
	 * Execute a signed paymaster transaction
	 * This sends the signed payload to the server for execution
	 */
	async executeSignedPaymasterTransaction(params: {
		accountAddress: string;
		calls: any[];
		signature: any;
		typedData: any;
		paymentMethod: PaymentMethod;
	}): Promise<PaymasterTransactionResponse> {
		const { accountAddress, calls, signature, typedData, paymentMethod } = params;

		try {
			const response = await fetch('/api/avnu/execute-signed-paymaster-transaction', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					accountAddress,
					calls,
					signature,
					typedData,
					paymentMethod
				})
			});

			if (!response.ok) {
				const errorData = await response.json();
				console.error('🔍 DEBUG: Full server error response:', {
					status: response.status,
					statusText: response.statusText,
					errorData: errorData,
					error: errorData.error,
					details: errorData.details,
					debugInfo: errorData.debugInfo,
					fullResponse: errorData
				});

				// Create a more detailed error message with server information
				const errorMessage = errorData.error || `Server error: ${response.status}`;
				const errorDetails = errorData.details || 'No additional details provided';
				const debugInfo = errorData.debugInfo
					? JSON.stringify(errorData.debugInfo, null, 2)
					: 'No debug info';

				const detailedError = new Error(
					`Paymaster execution failed: ${errorMessage}\n\nDetails: ${errorDetails}\n\nDebug Info: ${debugInfo}`
				);

				// Add server error details to the error object for debugging
				(detailedError as any).serverError = errorData;
				(detailedError as any).serverStatus = response.status;

				throw detailedError;
			}

			const result = await response.json();
			return result;
		} catch (error) {
			console.error('Transaction execution failed:', error);
			throw error;
		}
	}

	// Legacy method - keeping for backward compatibility
	async executeTransaction(
		params: PaymasterTransactionRequest
	): Promise<PaymasterTransactionResponse> {
		const { accountAddress, calls, paymentMethod } = params;

		try {
			const response = await fetch('/api/avnu/execute', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					accountAddress,
					calls,
					paymentMethod
				})
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || `Server error: ${response.status}`);
			}

			const result = await response.json();
			return result;
		} catch (error) {
			console.error('Transaction execution failed:', error);
			throw error;
		}
	}

	async getTransactionStatus(transactionHash: string): Promise<{
		status: 'pending' | 'success' | 'failed';
		error?: string;
	}> {
		const cacheKey = `tx-status-${transactionHash}`;
		const cached = this.cache.get(cacheKey);

		if (cached && Date.now() - cached.timestamp < 5000) {
			// 5 second cache
			return cached.status;
		}

		try {
			const response = await fetch(`/api/avnu/transaction-status/${transactionHash}`);

			if (!response.ok) {
				throw new Error(`Failed to fetch transaction status: ${response.status}`);
			}

			const status = await response.json();

			this.cache.set(cacheKey, {
				status,
				timestamp: Date.now()
			});

			return status;
		} catch (error) {
			console.error('Error fetching transaction status:', error);
			return {
				status: 'failed',
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	clearCache(): void {
		this.cache.clear();
	}
}
