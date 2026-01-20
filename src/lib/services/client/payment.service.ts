import type { AccountDeploymentComposable } from '$lib/composables/useAccountDeployment';
import { TOKEN_ADDRESSES, TRANSACTION_CONFIG } from '$lib/constants/blockchain.constants';
import { validateStarknetAddress } from '$lib/middleware/validation/starknet';
import type { UserWithCredentials } from '$lib/services/client/auth/types';
import type {
	PaymentCalls,
	PaymentConfig,
	PaymentRequest,
	PaymentResult,
	PaymentValidation
} from '$lib/types/payment.types';
import { createDefaultFeeCall } from '$lib/utils/fee-transaction.utils';
import type { Call } from 'starknet';
import { _ } from 'svelte-i18n';
import { get } from 'svelte/store';
// Manual gas execution imports removed (paymaster-only)

/**
 * Payment service for handling WBTC transfers (paymaster-only, gasless)
 *
 * All transactions are sponsored via paymaster and require WebAuthn
 * credentials. Manual gas estimation/execution is disabled.
 */
export class PaymentService {
	private static instance: PaymentService;
	private config: PaymentConfig;

	private constructor() {
		this.config = {
			wbtcTokenAddress: TOKEN_ADDRESSES.WBTC,
			minimumAmount: 100, // 100 sats minimum
			maxGasLimits: {
				l1Gas: 10000,
				l2Gas: TRANSACTION_CONFIG.MAX_L2_GAS_LIMIT,
				l1DataGas: 500
			}
		};
	}

	static getInstance(): PaymentService {
		if (!PaymentService.instance) {
			PaymentService.instance = new PaymentService();
		}
		return PaymentService.instance;
	}

	/**
	 * Validate payment request inputs
	 */
	validatePayment(request: PaymentRequest, user: UserWithCredentials | null): PaymentValidation {
		const errors: string[] = [];

		if (!user) {
			errors.push(get(_)('client.payment.login_required'));
		}

		if (!request.address?.trim()) {
			errors.push(get(_)('client.payment.recipient_required'));
		}

		// Ensure we only accept Starknet addresses in this manual WBTC transfer path
		if (
			request.address &&
			request.address.startsWith('0x') &&
			!validateStarknetAddress(request.address)
		) {
			// Add debug breadcrumb for troubleshooting
			console.warn(get(_)('client.payment.malformed_address'), {
				addressSample: request.address?.slice(0, 10) + '...'
			});
			errors.push(
				'Invalid Starknet address. For Bitcoin or Lightning, use the dedicated swap flows.'
			);
		}

		if (request.amountInSats <= 0) {
			errors.push('Amount must be greater than 0');
		}

		if (request.amountInSats < this.config.minimumAmount) {
			errors.push(get(_)('client.payment.minimum_amount', { amount: this.config.minimumAmount }));
		}

		return {
			isValid: errors.length === 0,
			errors
		};
	}

	/**
	 * Ensure WebAuthn credentials are loaded for the user
	 */
	private async ensureWebAuthnCredentials(user: UserWithCredentials): Promise<UserWithCredentials> {
		if (user.webauthnCredentials) {
			return user;
		}

		console.log('🔄 PAY: Loading WebAuthn credentials before transaction...');
		const { AuthService } = await import('$lib/services/client/auth.service');
		const authService = AuthService.getInstance();

		try {
			const enhancedUser = await authService.loadCurrentUser();
			console.log('🔄 PAY: Credentials loaded:', {
				success: !!enhancedUser?.webauthnCredentials,
				credentialsKeys: enhancedUser?.webauthnCredentials
					? Object.keys(enhancedUser.webauthnCredentials)
					: null
			});

			if (enhancedUser?.webauthnCredentials) {
				return enhancedUser;
			}
			throw new Error(get(_)('client.payment.passkey_required'));
		} catch (credError) {
			console.error('❌ PAY: Error loading credentials:', credError);
			throw new Error(get(_)('client.payment.passkey_load_failed'));
		}
	}

	/**
	 * Create payment transaction calls
	 */
	private createPaymentCalls(request: PaymentRequest): PaymentCalls {
		const wbtcAmount = BigInt(request.amountInSats);

		// Create the WBTC transfer call
		const transferCall: Call = {
			contractAddress: this.config.wbtcTokenAddress,
			entrypoint: 'transfer',
			calldata: [
				request.address.trim(), // recipient address
				wbtcAmount.toString(10), // amount (low part)
				'0x0' // amount (high part, 0 for amounts < 2^128)
			]
		};

		// Create fee call (0.01% of transaction amount)
		const feeCall = createDefaultFeeCall(this.config.wbtcTokenAddress, wbtcAmount);

		// Combine transfer and fee into multicall
		const calls: Call[] = [transferCall, feeCall];

		return {
			transferCall,
			feeCall,
			calls
		};
	}

	// getCurrentGasPriceWithMargin removed (paymaster-only)

	/**
	 * Estimate transaction gas with proper resource bounds
	 */
	// estimateTransactionGas removed (paymaster-only)

	/**
	 * Execute payment using paymaster (sponsored transaction)
	 */
	private async executePaymasterPayment(user: UserWithCredentials, calls: Call[]): Promise<string> {
		try {
			console.log('🔧 MAIN: Step 1 - Building paymaster transaction on server...');

			// Step 1: Get the transaction to sign from the server
			const { AvnuService } = await import('$lib/services/client/avnu.client.service');
			const avnuService = AvnuService.getInstance();

			const buildResponse = await avnuService.buildPaymasterTransaction({
				accountAddress: user.starknetAddress!,
				calls,
				paymentMethod: 'PAYMASTER_SPONSORED' as any
			});

			console.log('✅ MAIN: Paymaster transaction built successfully', {
				hasTypedData: !!buildResponse.typedData,
				hasTransaction: !!buildResponse.transaction,
				callCount: buildResponse.calls.length
			});

			// Step 2: Sign the typed data client-side using WebAuthn
			console.log('🔧 MAIN: Step 2 - Signing typed data with WebAuthn...');

			const { WebauthnService } = await import('$lib/services/client/webauthn.client.service');
			const webauthnService = WebauthnService.getInstance();

			// Create WebAuthn signer
			const webauthnSigner = webauthnService.createOwnerFromStoredCredentials(
				user.webauthnCredentials!.rpId,
				user.webauthnCredentials!.origin,
				user.webauthnCredentials!.credentialId,
				user.webauthnCredentials!.publicKey
			);

			if (!webauthnSigner) {
				throw new Error('Failed to create WebAuthn signer from stored credentials');
			}

			console.log('✅ MAIN: WebAuthn signer created successfully');

			// Calculate message hash from typedData for WebAuthn signing
			const { typedData } = await import('starknet');
			const messageHash = typedData.getMessageHash(buildResponse.typedData, user.starknetAddress);

			// Get the full WebAuthn signature object
			const rawWebAuthnSignature = await webauthnSigner.getRawSignature(messageHash);

			// Create the signature structure that Argent account contract expects
			const signature = {
				signer: webauthnSigner.signer,
				signature: rawWebAuthnSignature
			};

			console.log('✅ MAIN: Typed data signed successfully');

			// Step 3: Execute the signed transaction on server
			console.log('🔧 MAIN: Step 3 - Executing signed transaction on server...');

			const executeResponse = await avnuService.executeSignedPaymasterTransaction({
				accountAddress: user.starknetAddress!,
				calls,
				signature,
				typedData: buildResponse.typedData,
				paymentMethod: 'PAYMASTER_SPONSORED' as any
			});

			return executeResponse.transactionHash;
		} catch (error) {
			console.warn('⚠️ MAIN: Paymaster execution failed:', error);
			throw error;
		}
	}

	// executeManualPayment removed (paymaster-only)

	/**
	 * Execute payment transaction
	 */
	async executePayment(
		request: PaymentRequest,
		user: UserWithCredentials,
		accountDeployment: AccountDeploymentComposable
	): Promise<PaymentResult> {
		try {
			// Validate inputs
			const validation = this.validatePayment(request, user);
			if (!validation.isValid) {
				throw new Error(validation.errors.join(', '));
			}

			// Ensure WebAuthn credentials are loaded
			user = await this.ensureWebAuthnCredentials(user);

			// Check if account is deployed
			if (!accountDeployment) {
				throw new Error(get(_)('client.payment.deployment_service_unavailable'));
			}

			const isDeployed = accountDeployment.isAccountDeployed;
			if (!isDeployed) {
				throw new Error('Your account is not deployed yet. Please deploy your account first.');
			}

			// Create payment calls
			const paymentCalls = this.createPaymentCalls(request);

			// Get user's deployed account
			console.log('🔧 MAIN: Getting deployed account...');
			let account = await accountDeployment.getOrCreateAccount();

			if (!account) {
				console.log('⏳ MAIN: Account not ready, waiting for deployment to complete...');
				await new Promise((resolve) => setTimeout(resolve, 1000));
				account = await accountDeployment.getOrCreateAccount();

				if (!account) {
					throw new Error('Account deployment is in progress. Please wait and try again.');
				}
			}

			console.log('✅ MAIN: Account ready for transaction:', {
				address: account.address
			});

			// Refresh account state
			try {
				const { ClientRpcProxyService } = await import('$lib/services/client/rpc-proxy.service');
				const rpcProxy = ClientRpcProxyService.getInstance();

				await rpcProxy.getNonceForAddress(account.address);
				console.log('✅ MAIN: Account state refreshed successfully');
			} catch (nonceError) {
				console.warn('⚠️ MAIN: Failed to refresh account state:', nonceError);
			}

			let transactionHash: string;
			let usedPaymaster = true;

			// Debug paymaster condition
			console.log('🔍 PAYMASTER CONDITION DEBUG:', {
				usePaymaster: request.usePaymaster,
				usePaymasterNotFalse: request.usePaymaster !== false,
				currentUser: !!user,
				currentUserKeys: user ? Object.keys(user) : null,
				webauthnCredentials: !!user?.webauthnCredentials,
				credentialsType: typeof user?.webauthnCredentials,
				credentialsKeys: user?.webauthnCredentials ? Object.keys(user.webauthnCredentials) : null,
				fullCurrentUser: user,
				hasCredentialId: !!user?.credentialId,
				hasPublicKey: !!user?.publicKey
			});

			// Enforce paymaster-only. Disallow manual path and require passkey
			if (request.usePaymaster === false) {
				throw new Error(get(_)('client.payment.manual_gas_not_supported'));
			}
			if (user.webauthnCredentials) {
				console.log(
					'💎 MAIN: Using sponsored paymaster flow for manual WBTC transfer (PaymasterRpc)'
				);
				try {
					transactionHash = await this.executePaymasterPayment(user, paymentCalls.calls);
					usedPaymaster = true;
					console.log('✅ MAIN: Sponsored transaction executed successfully using PaymasterRpc!', {
						txHash: transactionHash
					});
					// Return early on success – no estimation needed
					console.log('🏁 MAIN: Paymaster path completed, skipping gas estimation.');
					console.log('Transaction submitted:', transactionHash);
					console.log('Waiting for transaction confirmation...');

					// Use RPC proxy service for fast transaction waiting with timeout handling
					const { ClientRpcProxyService } = await import('$lib/services/client/rpc-proxy.service');
					const rpcProxy = ClientRpcProxyService.getInstance();

					// Get current nonce to use as initial nonce for fastWaitForTransaction
					const currentNonce = await rpcProxy.getNonceForAddress(account.address);

					if (!currentNonce) {
						throw new Error('Failed to retrieve current nonce from account');
					}

					// Use fastWaitForTransaction which returns boolean indicating if next transaction can be sent
					const canSendNext = await rpcProxy.fastWaitForTransaction(
						transactionHash,
						user.starknetAddress!,
						currentNonce.toString()
					);

					console.log('Transaction confirmed successfully!', { canSendNext });
					return {
						transactionHash,
						success: true,
						usedPaymaster
					};
				} catch (paymasterError) {
					console.warn('⚠️ MAIN: Paymaster execution failed:', paymasterError);
					// Per policy: do not fallback to manual gas payment when paymaster is requested
					const errMsg =
						paymasterError instanceof Error
							? paymasterError.message
							: get(_)('client.payment.paymaster_failed');
					throw new Error(
						`Sponsored transaction failed (SNIP-29): ${errMsg}. Please try again later.`
					);
				}
			} else {
				throw new Error(get(_)('client.payment.passkey_required'));
			}
		} catch (error) {
			console.error('Payment error:', error);
			const errorMessage =
				error instanceof Error ? error.message : get(_)('client.payment.payment_failed');

			return {
				transactionHash: '',
				success: false,
				usedPaymaster: false,
				error: errorMessage
			};
		}
	}
}
