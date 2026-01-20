import { PublicEnv } from '$lib/config/env';
import { ClientRpcProxyService } from '$lib/services/client/rpc-proxy.service';
import { beginSigning, endSigning } from '$lib/stores/navigation-guard';
import { logger } from '$lib/utils/logger';
import type { WebauthnOwner } from '$lib/utils/webauthn';
import {
	Account,
	CallData,
	EDataAvailabilityMode,
	ETransactionVersion3,
	hash,
	RpcProvider,
	stark,
	typedData as typedDataUtils
} from 'starknet';
import type { UserWithCredentials } from '../auth.service';
import { AuthService } from '../auth.service';
import { WebauthnService } from '../webauthn.client.service';
import type { SignedTransaction, UnsignedTransaction } from './types';
import { TransactionValidator } from './validator';

/**
 * Transaction signer responsible for WebAuthn-based transaction signing
 * with gas estimation and resource bound management
 */
export class TransactionSigner {
	private validator = new TransactionValidator();

	/**
	 * Sign transactions using WebAuthn - PAYMASTER-ONLY MODE
	 * All transactions are signed for paymaster use only. Direct execution is disabled.
	 * @param transactions - The transactions to sign
	 * @param swapId - Optional swap ID for logging (used by Lightning transactions)
	 * @param signOnly - Must be true. Direct execution (signOnly=false) is disabled.
	 * @param typedData - Optional typed data for outside execution (SNIP-9 compliance)
	 */
	async signTransactions(
		transactions: UnsignedTransaction[],
		swapId?: string,
		signOnly: boolean = true,
		typedData?: any
	): Promise<SignedTransaction[]> {
		beginSigning();
		try {
			logger.info('Signing transactions with WebAuthn - PAYMASTER-ONLY MODE', {
				swapId,
				transactionCount: transactions.length,
				signOnly,
				mode: 'paymaster-only (direct execution disabled)'
			});

			// Add comprehensive logging of received transaction structure from API
			this.logTransactionStructure(transactions, swapId);

			// Get user credentials
			const authService = AuthService.getInstance();
			const user: UserWithCredentials | null = await authService.loadCurrentUser();

			if (!user || !user.webauthnCredentials) {
				throw new Error('User not authenticated or missing WebAuthn credentials');
			}

			// Create WebAuthn signer
			const signer = this.createWebAuthnSigner(user);

			const signedTransactions: SignedTransaction[] = [];

			// Sign each transaction
			for (const tx of transactions) {
				try {
					// Validate transaction before signing with enhanced error context
					this.validateTransactionForSigning(tx, swapId, signedTransactions.length);

					let signedTx: SignedTransaction;

					if (tx.type === 'INVOKE') {
						signedTx = await this.signInvokeTransaction(
							tx,
							swapId,
							user,
							signer,
							signOnly,
							typedData
						);
					} else if (tx.type === 'DEPLOY_ACCOUNT') {
						signedTx = await this.signDeployAccountTransaction(tx, swapId, user, signer, signOnly);
					} else {
						throw new Error(`Unsupported transaction type: ${tx.type}`);
					}

					signedTransactions.push(signedTx);

					logger.info('Transaction signed successfully', {
						swapId,
						txType: tx.type,
						txHash: signedTx.txHash,
						transactionIndex: signedTransactions.length - 1
					});
				} catch (txError) {
					logger.error('Failed to sign individual transaction', txError as Error, {
						swapId,
						txType: tx.type,
						transactionIndex: signedTransactions.length
					});
					throw txError;
				}
			}

			return signedTransactions;
		} catch (error) {
			logger.error('Failed to sign transactions', error as Error, { swapId });
			throw error;
		} finally {
			endSigning();
		}
	}

	/**
	 * Create WebAuthn signer from user credentials
	 */
	private createWebAuthnSigner(user: UserWithCredentials): WebauthnOwner {
		const webauthnService = WebauthnService.getInstance();
		const signer = webauthnService.createOwnerFromStoredCredentials(
			user.webauthnCredentials.rpId,
			user.webauthnCredentials.origin,
			user.webauthnCredentials.credentialId,
			user.webauthnCredentials.publicKey
		);

		if (!signer) {
			throw new Error('Failed to create WebAuthn signer');
		}

		return signer;
	}

	/**
	 * Log transaction structure for debugging
	 */
	private logTransactionStructure(transactions: UnsignedTransaction[], swapId?: string): void {
		logger.info('Received transaction structure from API', {
			swapId: swapId || 'unknown',
			transactionCount: transactions.length,
			receivedTransactions: transactions.map((tx, index) => ({
				index,
				type: tx?.type,
				hasType: !!tx?.type,
				hasTx: !!tx?.tx,
				txKeys: tx?.tx ? Object.keys(tx.tx) : [],
				txStructure: tx?.tx
					? {
							txType: tx.tx.type,
							isInvoke: tx.tx.type === 'INVOKE',
							isDeployAccount: tx.tx.type === 'DEPLOY_ACCOUNT',
							hasTx: !!tx.tx.tx,
							txKeys: Object.keys(tx.tx),
							allTxProperties: Object.keys(tx.tx)
						}
					: null,
				hasDetails: !!tx?.details,
				detailsKeys: tx?.details ? Object.keys(tx.details) : [],
				fullTransactionStructure: Object.keys(tx || {})
			}))
		});
	}

	/**
	 * Validate transaction for signing with enhanced error context
	 */
	private validateTransactionForSigning(
		tx: UnsignedTransaction,
		swapId: string | undefined,
		transactionIndex: number
	): void {
		try {
			this.validator.validateTransaction(tx, swapId || 'unknown');
		} catch (validationError) {
			logger.error(
				'Transaction validation failed during signing process',
				validationError as Error,
				{
					swapId: swapId || 'unknown',
					txType: tx.type,
					txIndex: transactionIndex,
					txStructure: tx.tx ? Object.keys(tx.tx) : [],
					availableFields: tx.tx ? Object.keys(tx.tx) : [],
					numericFields: tx.tx ? Object.keys(tx.tx).filter((key) => !isNaN(Number(key))) : [],
					validationStage: 'signing_process'
				}
			);
			throw validationError;
		}
	}

	/**
	 * Sign INVOKE transaction
	 */
	private async signInvokeTransaction(
		tx: UnsignedTransaction,
		swapId: string,
		user: UserWithCredentials,
		signer: any,
		signOnly: boolean,
		typedData?: any
	): Promise<SignedTransaction> {
		logger.info('Processing INVOKE transaction for signing', {
			swapId,
			userAddress: user.starknetAddress || 'unknown',
			txStructure: tx.tx ? Object.keys(tx.tx) : []
		});

		// Use RPC proxy service for secure server-side RPC access
		const rpcProxy = ClientRpcProxyService.getInstance();

		if (!user.starknetAddress) {
			throw new Error('User starknetAddress is required for transaction signing');
		}

		// Create account without provider (we'll use RPC proxy for network calls)
		const account = new Account({
			provider: null as any, // No provider needed for signing-only operations
			address: user.starknetAddress,
			signer: signer,
			cairoVersion: '1', // Cairo version as string for v8.x compatibility
			transactionVersion: ETransactionVersion3.V3
		});

		// Extract calls from transaction
		let calls: any[] = [];
		if (Array.isArray(tx.tx)) {
			calls = tx.tx;
		} else if (tx.tx && typeof tx.tx === 'object' && tx.tx.tx && Array.isArray(tx.tx.tx)) {
			calls = tx.tx.tx;
		} else {
			throw new Error('Invalid INVOKE transaction structure for signing');
		}

		logger.info('Extracted calls for INVOKE transaction', {
			swapId,
			callCount: calls.length,
			calls: calls.map((call, index) => ({
				index,
				contractAddress: call.contractAddress,
				entrypoint: call.entrypoint,
				calldataLength: call.calldata ? call.calldata.length : 0
			}))
		});

		// Force sign-only mode for all transactions - direct execution is disabled
		if (!signOnly) {
			throw new Error(
				'Direct transaction execution is disabled. All transactions must use paymaster (signOnly=true).'
			);
		}

		// Sign-only mode: Create signed transaction for paymaster use
		// For paymaster transactions, we don't need resource bounds - the paymaster handles gas
		logger.info('Creating signed transaction for paymaster (sign-only mode)', {
			swapId,
			callCount: calls.length,
			note: 'No resource bounds needed for paymaster transactions'
		});

		// Get nonce for transaction via RPC proxy
		const nonce = await rpcProxy.getNonce(user.starknetAddress);

		// For paymaster transactions, we need to provide safe, non-zero values
		// to avoid BigInt conversion errors in the Starknet.js library

		// Validate required user properties to prevent undefined values
		if (!user.starknetAddress) {
			throw new Error('User starknetAddress is required for paymaster transactions');
		}

		const transactionOptions = {
			version: ETransactionVersion3.V3,
			nonceDataAvailabilityMode: EDataAvailabilityMode.L1,
			feeDataAvailabilityMode: EDataAvailabilityMode.L1,
			// Safe, non-zero values to avoid BigInt conversion errors
			nonce,
			tip: BigInt(0),
			paymasterData: [],
			accountDeploymentData: [],
			// Safe resource bounds with non-zero values
			resourceBounds: {
				l1_gas: { max_amount: BigInt(1), max_price_per_unit: BigInt(1) },
				l2_gas: { max_amount: BigInt(1), max_price_per_unit: BigInt(1) },
				l1_data_gas: { max_amount: BigInt(1), max_price_per_unit: BigInt(1) }
			},
			// Additional required properties for InvocationsSignerDetails
			walletAddress: user.starknetAddress,
			cairoVersion: '1' as const,
			chainId: '0x534e5f4d41494e' as const // Mainnet
		};

		// For paymaster transactions (signOnly=true), bypass the ArgentSigner -> MultisigSigner chain
		// that flattens the WebAuthn signature. Instead, call the WebAuthn signer directly to preserve
		// the full signature structure that AVNU PaymasterRpc expects.
		let signature: any;

		if (
			signer &&
			typeof signer === 'object' &&
			'getRawSignature' in signer &&
			'signer' in signer &&
			typedData
		) {
			// Preferred WebAuthn path: obtain raw signature object and include signer info
			logger.info('Using getRawSignature for WebAuthn paymaster signing', {
				swapId,
				hasTypedData: !!typedData
			});

			const messageHash = typedDataUtils.getMessageHash(typedData, user.starknetAddress);
			const rawSignature = await signer.getRawSignature(messageHash);
			signature = { signer: signer.signer, signature: rawSignature };

			logger.info('Raw WebAuthn signature obtained for paymaster', {
				swapId,
				hasSigner: !!signature.signer,
				hasSignature: !!signature.signature
			});
		} else if (signer && typeof signer === 'object' && 'signMessage' in signer) {
			// Generic signMessage path (may produce flattened signature arrays)
			logger.info('Using signMessage for paymaster signing', {
				swapId,
				hasTypedData: !!typedData
			});

			if (typedData) {
				logger.info('Signing typed data with signMessage', {
					swapId,
					typedDataKeys: Object.keys(typedData)
				});
				signature = await signer.signMessage(typedData, user.starknetAddress);
			} else {
				logger.warn('No typed data provided, signing calls directly', {
					swapId
				});
				signature = await signer.signMessage(calls, user.starknetAddress);
			}

			logger.info('Signature obtained via signMessage', {
				swapId,
				signatureType: typeof signature
			});
		} else {
			// Fallback to ArgentSigner for non-WebAuthn signers
			logger.info('Using ArgentSigner fallback for non-WebAuthn signer', {
				swapId,
				signerType: typeof signer,
				hasSignMessage: signer && 'signMessage' in signer,
				note: 'This may result in flattened signature format'
			});

			signature = await account.signer.signTransaction(calls, transactionOptions);
		}

		// Calculate transaction hash for the signed transaction
		// Use the same safe values for consistency
		const calldata = CallData.compile(calls);
		const txHash = hash.calculateInvokeTransactionHash({
			senderAddress: user.starknetAddress, // Already validated above
			compiledCalldata: calldata,
			version: ETransactionVersion3.V3,
			nonce,
			resourceBounds: {
				l1_gas: { max_amount: BigInt('0x1'), max_price_per_unit: BigInt('0x1') },
				l2_gas: { max_amount: BigInt('0x1'), max_price_per_unit: BigInt('0x1') },
				l1_data_gas: { max_amount: BigInt('0x1'), max_price_per_unit: BigInt('0x1') }
			},
			nonceDataAvailabilityMode: stark.intDAM(EDataAvailabilityMode.L1),
			feeDataAvailabilityMode: stark.intDAM(EDataAvailabilityMode.L1),
			accountDeploymentData: [],
			paymasterData: [],
			tip: BigInt(0),
			chainId: '0x534e5f4d41494e' // Mainnet
		});

		logger.info('Transaction signed successfully for paymaster', {
			swapId,
			txHash,
			signatureLength: Array.isArray(signature) ? signature.length : 1,
			note: 'Full WebAuthn signature structure preserved for PaymasterRpc'
		});

		// For paymaster transactions, preserve the full WebAuthn signature structure
		// AVNU PaymasterRpc expects the complete signature with ec_signature, flags, etc.
		let starknetSignature: any = signature; // Keep the full structure for PaymasterRpc

		// Debug: Log the actual signature structure
		logger.info('Paymaster signature structure analysis', {
			swapId,
			signatureType: typeof signature,
			isArray: Array.isArray(signature),
			isUint8Array: signature instanceof Uint8Array,
			signatureKeys: signature && typeof signature === 'object' ? Object.keys(signature) : [],
			signatureLength:
				signature && typeof signature === 'object' ? Object.keys(signature).length : 0,
			firstFewValues:
				signature && typeof signature === 'object'
					? Object.keys(signature)
							.slice(0, 5)
							.map((key) => ({ key, value: signature[key] }))
					: [],
			note: 'Full WebAuthn signature structure preserved for PaymasterRpc'
		});

		// Debug logging for signature conversion
		logger.info('Paymaster WebAuthn signature preservation', {
			swapId,
			hasOriginalSignature: !!signature,
			originalSignatureKeys: signature ? Object.keys(signature) : [],
			hasEcSignature: signature && 'ec_signature' in signature,
			ecSignatureKeys:
				signature && signature.ec_signature ? Object.keys(signature.ec_signature) : [],
			hasR: signature && signature.ec_signature && 'r' in signature.ec_signature,
			hasS: signature && signature.ec_signature && 's' in signature.ec_signature,
			preservedSignature: starknetSignature,
			finalSignatureKeys: starknetSignature ? Object.keys(starknetSignature) : [],
			note: 'Full WebAuthn signature structure preserved for PaymasterRpc - no conversion needed'
		});

		return {
			type: tx.type,
			txHash,
			signature: starknetSignature, // Use full WebAuthn signature structure for PaymasterRpc
			tx: {
				type: 'INVOKE',
				tx: calls,
				details: {
					version: ETransactionVersion3.V3,
					nonce: `0x${nonce.toString(16)}`,
					resourceBounds: {
						l1_gas: { max_amount: BigInt(1), max_price_per_unit: BigInt(1) },
						l2_gas: { max_amount: BigInt(1), max_price_per_unit: BigInt(1) },
						l1_data_gas: { max_amount: BigInt(1), max_price_per_unit: BigInt(1) }
					},
					tip: BigInt(0),
					paymasterData: [],
					accountDeploymentData: [],
					nonceDataAvailabilityMode: EDataAvailabilityMode.L1,
					feeDataAvailabilityMode: EDataAvailabilityMode.L1,
					walletAddress: user.starknetAddress,
					cairoVersion: '1' as const,
					chainId: '0x534e5f4d41494e' as const
				}
			},
			details: tx.details ?? ({} as any)
		};
	}

	/**
	 * Sign DEPLOY_ACCOUNT transaction
	 */
	private async signDeployAccountTransaction(
		tx: UnsignedTransaction,
		swapId: string,
		user: UserWithCredentials,
		signer: any,
		signOnly: boolean
	): Promise<SignedTransaction> {
		logger.info('Processing DEPLOY_ACCOUNT transaction for signing', {
			swapId,
			userAddress: user.starknetAddress || 'unknown',
			txStructure: tx.tx ? Object.keys(tx.tx) : [],
			signOnly
		});

		// DEPLOY_ACCOUNT transactions should always be executed directly
		if (signOnly) {
			throw new Error(
				'DEPLOY_ACCOUNT transactions do not support sign-only mode. They must be executed directly.'
			);
		}

		// Create provider with secure RPC URL access for transaction signing
		const provider = new RpcProvider({
			nodeUrl: '/api/rpc', // This will be intercepted by the RPC proxy
			specVersion: PublicEnv.STARKNET_SPEC_VERSION()
		});

		if (!user.starknetAddress) {
			throw new Error('User starknetAddress is required for transaction signing');
		}

		const account = new Account({
			provider,
			address: user.starknetAddress,
			signer: signer,
			cairoVersion: '1', // Cairo version as string for v8.x compatibility
			transactionVersion: ETransactionVersion3.V3
		});

		// For DEPLOY_ACCOUNT, we need to handle the transaction structure
		const deployTx = tx.tx as any;

		logger.info('Deploying account with transaction', {
			swapId,
			deployTxKeys: Object.keys(deployTx)
		});

		// Deploy the account
		const result = await account.deployAccount(deployTx);

		return {
			type: tx.type,
			txHash: result.transaction_hash,
			tx: tx.tx,
			details: tx.details ?? ({} as any)
		};
	}
}
