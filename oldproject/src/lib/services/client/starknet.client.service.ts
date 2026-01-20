import { AVNU_CONFIG, PaymentMethod } from '$lib/config/avnu.config';
import { TOKEN_ADDRESSES } from '$lib/constants/blockchain.constants';
import { ClientRpcProxyService } from '$lib/services/client/rpc-proxy.service';
import { isApiErrorResponse, isDeployAccountResponse } from '$lib/types/api';
import { _ } from 'svelte-i18n';
import { get } from 'svelte/store';

import { buildArgentConstructorCalldataFromWebauthn } from '$lib/utils/starknet/argent-calldata';
import { WebauthnOwner } from '$lib/utils/webauthn';
import {
	Account,
	ETransactionVersion3,
	hash,
	PaymasterRpc,
	RpcProvider
} from 'starknet';

export interface FeeEstimate {
	l1_gas_consumed?: bigint;
	l2_gas_consumed?: bigint;
	l1_data_gas_consumed?: bigint;
	l1_gas_price?: bigint;
	l2_gas_price?: bigint;
	l1_data_gas_price?: bigint;
	resourceBounds?: any;
}

export interface DeploymentOptions {
	classHash: string;
	owner: WebauthnOwner;
	provider: RpcProvider;
	paymentMethod?: PaymentMethod;
}

export class StarknetService {
	private static instance: StarknetService;
	private cache = new Map<string, any>();

	private constructor() {}

	static getInstance(): StarknetService {
		if (!StarknetService.instance) {
			StarknetService.instance = new StarknetService();
		}
		return StarknetService.instance;
	}

	/**
	 * Centralized method to calculate contract address from hash
	 * This ensures consistency across the application
	 */
	static calculateContractAddress(
		addressSalt: bigint,
		classHash: string,
		constructorCalldata: any[],
		deployerAddress: number = 0
	): string {
		console.log('🔍 DEBUG: calculateContractAddress inputs:', {
			addressSalt: addressSalt.toString(),
			classHash,
			constructorCalldata,
			constructorCalldataLength: constructorCalldata.length,
			deployerAddress
		});

		// Check for undefined values in constructorCalldata
		const undefinedIndices = constructorCalldata
			.map((val, idx) => (val === undefined ? idx : -1))
			.filter((idx) => idx !== -1);

		if (undefinedIndices.length > 0) {
			console.error(
				'❌ ERROR: Found undefined values in constructorCalldata at indices:',
				undefinedIndices
			);
			console.error('Full constructorCalldata:', constructorCalldata);
		}

		const address = hash.calculateContractAddressFromHash(
			addressSalt,
			classHash,
			constructorCalldata,
			deployerAddress
		);

		// Ensure consistent formatting with leading zeros
		return '0x' + BigInt(address).toString(16).padStart(64, '0');
	}

	async calculateAccountAddress(classHash: string, webauthnOwner: WebauthnOwner): Promise<string> {
		const cacheKey = `address-${classHash}-${webauthnOwner.signer.variant.Webauthn.pubkey}`;
		const cached = this.cache.get(cacheKey);

		if (cached && Date.now() - cached.timestamp < 60000) {
			// 1 minute cache
			return cached.address;
		}

		// Calculate address using client-side implementation (equivalent to server-side calculateWebauthnAccountAddress)
		const addressSalt = 12n;

		// Build constructor calldata manually to ensure correct enum discriminant
		const constructorCalldata = buildArgentConstructorCalldataFromWebauthn({
			origin: webauthnOwner.signer.variant.Webauthn.origin,
			rp_id_hash: webauthnOwner.signer.variant.Webauthn.rp_id_hash,
			pubkey: webauthnOwner.signer.variant.Webauthn.pubkey
		});

		// Calculate contract address using client-side method
		const address = StarknetService.calculateContractAddress(
			addressSalt,
			classHash,
			constructorCalldata,
			0
		);

		this.cache.set(cacheKey, {
			address,
			timestamp: Date.now()
		});

		return address;
	}

	async deployAccount(options: DeploymentOptions): Promise<Account> {
		const { classHash, owner, provider, paymentMethod } = options;

		// Validate that paymentMethod is provided and not SELF_PAY
		if (!paymentMethod) {
			throw new Error('paymentMethod is required for account deployment');
		}

		if (paymentMethod === PaymentMethod.SELF_PAY) {
			throw new Error(
				'PaymentMethod.SELF_PAY should never be used for account deployment. Use PaymentMethod.PAYMASTER_SPONSORED instead.'
			);
		}

		try {
			return await this.deployAccountWithPaymaster(classHash, owner, provider, paymentMethod);
		} catch (error) {
			console.error(`Account deployment failed with ${paymentMethod}:`, error);
			throw error;
		}
	}

	private async deployAccountWithPaymaster(
		classHash: string,
		webauthnOwner: WebauthnOwner,
		provider: RpcProvider,
		_paymentMethod: PaymentMethod
	): Promise<Account> {
		const accountAddress = await this.calculateAccountAddress(classHash, webauthnOwner);
		console.log('requesting sponsored deployment for account:', accountAddress);

		try {
			const signer = webauthnOwner.signer.variant.Webauthn;

			console.log('🔍 DEBUG: Client-side signerData creation for paymaster:', {
				accountAddress,
				webauthnOwnerSigner: webauthnOwner.signer,
				webauthnVariant: webauthnOwner.signer.variant.Webauthn,
				extractedSignerData: signer
			});

			const response = await fetch('/api/avnu/deploy-account', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					classHash,
					signer
				})
			});

			if (!response.ok) {
				const errorData = await response.json();
				if (isApiErrorResponse(errorData)) {
					throw new Error(errorData.error);
				}
				throw new Error(`Server error: ${response.status}`);
			}

			const result = await response.json();

			// Validate response format using type guard
			if (!isDeployAccountResponse(result)) {
				console.error('Invalid API response format:', result);
				throw new Error('Server returned invalid response format. Please try again.');
			}

			console.log('sponsored deployment initiated, tx:', result.transactionHash);
			console.log('waiting for deployment confirmation...');

			// Use regular waitForTransaction for account deployments
			// fastWaitForTransaction requires the account to exist (for nonce checks),
			// but newly deployed accounts may not be indexed yet, causing "Contract not found" errors
			try {
				const rpcProxy = ClientRpcProxyService.getInstance();
				await rpcProxy.waitForTransaction(result.transactionHash);
				console.log('sponsored deployment completed');
			} catch (waitError) {
				console.error('Error waiting for transaction:', waitError);
				throw new Error(`Transaction submitted but confirmation failed: ${waitError instanceof Error ? waitError.message : String(waitError)}`);
			}

			return new Account({
				provider,
				address: result.accountAddress,
				signer: webauthnOwner.signer.variant.Webauthn,
				cairoVersion: '1',
				transactionVersion: ETransactionVersion3.V3
			});
		} catch (error) {
			console.error('Sponsored deployment failed:', error);
			throw error;
		}
	}

	async checkAccountDeployment(
		address: string,
		_provider: RpcProvider
	): Promise<{
		isDeployed: boolean;
		balance?: string;
		error?: string;
	}> {
		const cacheKey = `deployment-${address}`;
		const cached = this.cache.get(cacheKey);

		if (cached && Date.now() - cached.timestamp < 10000) {
			// 10 second cache
			return cached.result;
		}

		console.log('🔍 Checking account deployment status for:', address);

		// Retry mechanism with exponential backoff for RPC node indexing
		const maxRetries = 5;
		const baseDelay = 1000; // 1 second

		for (let attempt = 0; attempt < maxRetries; attempt++) {
			try {
				// Use RPC proxy service for getClassHashAt instead of direct provider
				const rpcProxy = ClientRpcProxyService.getInstance();
				// Only log errors on final attempt to avoid noise during retries
				const logErrors = attempt === maxRetries - 1;
				const classHashResponse = await rpcProxy.call(
					'starknet_getClassHashAt',
					[address],
					logErrors
				);

				if (!classHashResponse.success) {
					// If we can't get class hash, the account might not be indexed yet
					if (attempt < maxRetries - 1) {
						// Wait before retrying (exponential backoff)
						const delay = baseDelay * Math.pow(2, attempt);
						await new Promise((resolve) => setTimeout(resolve, delay));
						continue;
					}
					// On final attempt, throw error
					throw new Error(classHashResponse.error || get(_)('client.starknet.class_hash_failed'));
				}

				const classHash = classHashResponse.data;
				console.log('✅ Account deployed! Class hash:', classHash);

				let balance = get(_)('client.starknet.balance_unavailable');

				try {
					// Use RPC proxy service for balance check instead of direct provider callContract
					const WBTCTokenAddress = TOKEN_ADDRESSES.WBTC;
					const balanceResponse = await rpcProxy.call('starknet_call', [
						{
							contract_address: WBTCTokenAddress,
							entry_point_selector: 'balanceOf',
							calldata: [address]
						}
					]);

					if (balanceResponse.success && balanceResponse.data) {
						console.log('balanceResponse:', balanceResponse.data);

						let balanceArray;
						if (Array.isArray(balanceResponse.data)) {
							balanceArray = balanceResponse.data;
						} else if (balanceResponse.data.result && Array.isArray(balanceResponse.data.result)) {
							balanceArray = balanceResponse.data.result;
						}

						if (balanceArray && balanceArray.length > 0) {
							const balanceValue = BigInt(balanceArray[0]);
							balance = Number(balanceValue).toLocaleString() + ' sats';
						}
					}
				} catch (balanceError) {
					console.log(
						'⚠️ Could not fetch balance (account is deployed but balance check failed):',
						balanceError
					);
					// Don't throw here - account is deployed, just balance fetch failed
				}

				const result = { isDeployed: true, balance };

				this.cache.set(cacheKey, {
					result,
					timestamp: Date.now()
				});

				return result;
			} catch (error) {
				if (attempt < maxRetries - 1) {
					// Wait before retrying (exponential backoff)
					const delay = baseDelay * Math.pow(2, attempt);
					await new Promise((resolve) => setTimeout(resolve, delay));
					continue;
				}

				// Only log error on final attempt
				console.log('❌ Account not deployed yet:', error);

				const result = { isDeployed: false, error: error.message };

				this.cache.set(cacheKey, {
					result,
					timestamp: Date.now()
				});

				return result;
			}
		}

		// This should never be reached, but just in case
		return { isDeployed: false, error: get(_)('client.starknet.max_retries_exceeded') };
	}

	/**
	 * Create an Account instance with optional paymaster support
	 */
	createAccount(
		provider: RpcProvider,
		address: string,
		signer: any,
		cairoVersion: '0' | '1' = '1',
		withPaymaster: boolean = false
	): Account {
		if (withPaymaster) {
			const paymaster = new PaymasterRpc({
				nodeUrl: AVNU_CONFIG.API_BASE_URL
				// Note: For sponsored transactions, API key is handled server-side
			});

			return new Account({
				provider,
				address,
				signer,
				cairoVersion: cairoVersion, // Keep as string for v8.x compatibility
				transactionVersion: ETransactionVersion3.V3,
				paymaster
			});
		}

		return new Account({
			provider,
			address,
			signer,
			cairoVersion: cairoVersion, // Keep as string for v8.x compatibility
			transactionVersion: ETransactionVersion3.V3
		});
	}

	formatFeeAmount(amount: string, price: string): string {
		const amountNum = parseInt(amount, 16);
		const priceNum = parseInt(price, 16);
		const totalWei = amountNum * priceNum;
		const totalEth = totalWei / 1e18;
		return totalEth.toFixed(6);
	}

	/**
	 * Test RPC connectivity and account deployment check
	 */
	async testRpcConnectivity(
		address: string
	): Promise<{ success: boolean; error?: string; details?: any }> {
		try {
			console.log('🧪 Testing RPC connectivity for address:', address);

			// Test RPC proxy connectivity first
			const rpcProxy = ClientRpcProxyService.getInstance();
			const connectivityTest = await rpcProxy.testConnectivity();

			if (!connectivityTest.success) {
				return {
					success: false,
					error: `RPC proxy connectivity failed: ${connectivityTest.error}`
				};
			}

			// Test account deployment check
			const deploymentResult = await this.checkAccountDeployment(address, null as any);

			return {
				success: true,
				details: {
					rpcConnectivity: connectivityTest,
					deploymentCheck: deploymentResult
				}
			};
		} catch (error) {
			console.error('❌ RPC connectivity test failed:', error);
			return {
				success: false,
				error: error instanceof Error ? error.message : get(_)('client.starknet.unknown_error')
			};
		}
	}

	clearCache(): void {
		this.cache.clear();
	}
}
