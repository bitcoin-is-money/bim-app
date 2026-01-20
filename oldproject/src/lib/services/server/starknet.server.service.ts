/**
 * @fileoverview Server-side Starknet Service
 *
 * This service provides server-side Starknet operations including account
 * deployment, contract address calculation, and blockchain interactions.
 * This is separate from the client service to avoid browser-specific dependencies.
 *
 * Key Features:
 * - Contract address calculation using Starknet hash utilities
 * - Account deployment via paymaster
 * - Server-side account validation
 * - Provider management for server contexts
 *
 * @requires starknet - Starknet.js library
 * @requires $lib/config/avnu-server.config - Server configuration
 * @requires $lib/utils/starknet - Starknet utilities
 *
 * @author bim
 * @version 1.0.0
 */

import { AVNU_SERVER_CONFIG } from '$lib/config/avnu-server.config';
import { AVNU_CONFIG } from '$lib/config/avnu.config';
import { PublicEnv } from '$lib/config/env';
import { ServerPrivateEnv } from '$lib/config/server';
import { logger } from '$lib/utils/logger';
import { SignerType, signerTypeToCustomEnum } from '$lib/utils/starknet';
import { calculateWebauthnAccountAddress } from '$lib/utils/webauthn/server';
import { createWebauthnCredentialData } from '$lib/utils/webauthn/WebauthnCredentialData';
import type { WebauthnSigner } from '$lib/utils/webauthn/WebauthnOwner';
import { buildArgentConstructorCalldataFromWebauthn } from '$lib/utils/starknet/argent-calldata';
import type { AccountDeploymentData } from '@starknet-io/types-js';
import {
	Account,
	CairoOption,
	CairoOptionVariant,
	CallData,
	ETransactionVersion3,
	hash,
	PaymasterRpc,
	RpcProvider,
	type PaymasterDetails
} from 'starknet';

/**
 * Account deployment result
 */
export interface AccountDeploymentResult {
	transactionHash: string;
	accountAddress: string;
}

/**
 * Server-side Starknet service for blockchain operations
 */
export class ServerStarknetService {
	private static instance: ServerStarknetService;

	private constructor() {}

	static getInstance(): ServerStarknetService {
		if (!ServerStarknetService.instance) {
			ServerStarknetService.instance = new ServerStarknetService();
		}
		return ServerStarknetService.instance;
	}

	/**
	 * Calculate contract address from hash
	 * This ensures consistency across the application
	 */
	static calculateContractAddress(
		addressSalt: bigint,
		classHash: string,
		constructorCalldata: any[],
		deployerAddress: number = 0
	): string {
		const address = hash.calculateContractAddressFromHash(
			addressSalt,
			classHash,
			constructorCalldata,
			deployerAddress
		);

		// Ensure consistent formatting with leading zeros
		return '0x' + BigInt(address).toString(16).padStart(64, '0');
	}

	/**
	 * Calculate account address using WebAuthn credential data (server-safe)
	 */
	static calculateWebauthnAccountAddress(
		classHash: string,
		rpId: string,
		origin: string,
		credentialId: string,
		publicKey: string,
		addressSalt: bigint = 12n
	): string {
		const credentialData = createWebauthnCredentialData(rpId, origin, credentialId, publicKey);
		return calculateWebauthnAccountAddress(classHash, credentialData, addressSalt);
	}

	/**
	 * Calculate account address for given class hash and signer
	 */
	static async calculateAccountAddress(
		classHash: string,
		signerData: WebauthnSigner
	): Promise<string> {
		// WebAuthn signer already contains all necessary public key information

		console.log('🔍 DEBUG: Server-side signer creation from signerData:', {
			receivedSignerData: signerData,
			originType: typeof signerData.origin,
			originValue: signerData.origin,
			rpIdHashType: typeof signerData.rp_id_hash,
			rpIdHashValue: signerData.rp_id_hash,
			pubkeyType: typeof signerData.pubkey,
			pubkeyValue: signerData.pubkey,
			pubkeyStringValue: JSON.stringify(signerData.pubkey),
			signerTypeUsed: 'Webauthn',
			signerTypeValue: SignerType.Webauthn
		});

		// Build constructor calldata manually to guarantee correct enum discriminant order
		const constructorCalldata = buildArgentConstructorCalldataFromWebauthn({
			origin: signerData.origin,
			rp_id_hash: signerData.rp_id_hash,
			pubkey: signerData.pubkey
		});

		const addressSalt = 12n;
		return ServerStarknetService.calculateContractAddress(
			addressSalt,
			classHash,
			constructorCalldata,
			0
		);
	}

	/**
	 * Deploy account using paymaster (server-side only)
	 */
	async deployAccountWithPaymaster(
		classHash: string,
		signer: any
	): Promise<AccountDeploymentResult> {
		try {
			logger.info('Initiating paymaster account deployment', {
				classHash,
				signer
			});

			// Create provider with server's RPC configuration
			const provider = new RpcProvider({
				nodeUrl: ServerPrivateEnv.STARKNET_RPC_URL(),
				specVersion: PublicEnv.STARKNET_SPEC_VERSION()
			});

			// Build constructor calldata manually to ensure the correct
			// Signer::Webauthn discriminant (4) and field ordering
			const constructorCalldata = buildArgentConstructorCalldataFromWebauthn(signer);

			const addressSalt = 12n;
			const accountAddress = ServerStarknetService.calculateContractAddress(
				addressSalt,
				classHash,
				constructorCalldata,
				0
			);

			logger.info('Calculated account address', { accountAddress });

			// Create PaymasterRpc with API key (server-side only)
			const paymaster = new PaymasterRpc({
				nodeUrl: AVNU_CONFIG.API_BASE_URL,
				headers: { 'x-paymaster-api-key': AVNU_SERVER_CONFIG.API_KEY }
			});

			// Create a temporary account instance for deployment
			const tempAccount = new Account({
				provider,
				address: accountAddress,
				signer: '0x1',
				cairoVersion: '1', // Cairo version as string
				transactionVersion: ETransactionVersion3.V3,
				paymaster
			});

			const deploymentData: AccountDeploymentData = {
				version: 1,
				class_hash: classHash,
				calldata: constructorCalldata.map((val) => {
					if (val === undefined || val === null) {
						throw new Error(`Invalid calldata value: ${val}`);
					}
					if (typeof val === 'string' && val.startsWith('0x')) {
						return val;
					}
					return `0x${BigInt(val).toString(16).padStart(64, '0')}`;
				}),
				salt: `0x${12n.toString(16).padStart(64, '0')}`,
				address: accountAddress
			};

			logger.info('Prepared deployment data', { deploymentData });

			const paymasterDetails: PaymasterDetails = {
				feeMode: { mode: 'sponsored' }, // Sponsored mode for AVNU paymaster
				deploymentData: { ...deploymentData, version: 1 as 1 }
			};

			logger.info('Executing paymaster transaction');

			const resp = await tempAccount.executePaymasterTransaction([], paymasterDetails);

			logger.info('Account deployment transaction submitted', {
				transactionHash: resp.transaction_hash,
				accountAddress
			});

			return {
				transactionHash: resp.transaction_hash,
				accountAddress: accountAddress
			};
		} catch (error) {
			logger.error('Account deployment failed', error as Error);
			throw error;
		}
	}

	/**
	 * Check if an account is deployed at the given address
	 */
	async isAccountDeployed(address: string, provider: RpcProvider): Promise<boolean> {
		try {
			await provider.getClassHashAt(address);
			return true;
		} catch (error) {
			// If getClassHashAt throws, the account is not deployed
			return false;
		}
	}
}

// Export singleton instance
export const serverStarknetService = ServerStarknetService.getInstance();
