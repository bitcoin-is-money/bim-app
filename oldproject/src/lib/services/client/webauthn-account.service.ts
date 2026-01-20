import { PaymentMethod } from '$lib/config/avnu.config';
import { PublicEnv } from '$lib/config/env';
import type { User } from '$lib/db';
import { StarknetService, WebauthnService } from '$lib/services';
import { WebauthnOwner } from '$lib/utils/webauthn';
import { Account, RpcProvider } from 'starknet';
import { _ } from 'svelte-i18n';
import { get } from 'svelte/store';

export interface WebauthnAccountConfig {
	rpId: string;
	classHash: string;
	rpcUrl: string;
	specVersion: '0.9.0';
}

export interface AccountDeploymentResult {
	success: boolean;
	account?: Account;
	error?: string;
}

export interface AccountStatus {
	isDeployed: boolean;
	balance?: string;
	address: string;
}

export interface FeeEstimate {
	amount: string;
	price: string;
	formatted: string;
}

export class WebauthnAccountService {
	private webauthnService: WebauthnService;
	private starknetService: StarknetService;
	private config: WebauthnAccountConfig;
	private provider: RpcProvider | null = null;

	constructor(config?: Partial<WebauthnAccountConfig>) {
		this.webauthnService = WebauthnService.getInstance();
		this.starknetService = StarknetService.getInstance();

		this.config = {
			rpId: PublicEnv.WEBAUTHN_RP_ID(),
			classHash: PublicEnv.BIM_ARGENT_050_ACCOUNT_CLASS_HASH(),
			rpcUrl: '', // No longer needed - using RPC proxy
			specVersion: PublicEnv.STARKNET_SPEC_VERSION() as '0.9.0',
			...config
		};

		// Provider will be created lazily when needed for network operations
	}

	/**
	 * Get or create a provider instance for Starknet operations
	 * Since direct RPC access is blocked on client-side, this creates a provider
	 * that uses the RPC proxy service for actual network operations
	 */
	private getOrCreateProvider(): RpcProvider {
		if (!this.provider) {
			// Create a provider that uses the RPC proxy service
			// The actual RPC calls will go through the server-side proxy
			this.provider = new RpcProvider({
				nodeUrl: '/api/rpc', // This will be intercepted by the RPC proxy
				specVersion: this.config.specVersion
			});
		}
		return this.provider;
	}

	public validateUserCredentials(user: User): boolean {
		return !!(user.credentialId && user.publicKey);
	}

	public createOwnerFromUserData(user: User): WebauthnOwner {
		if (!this.validateUserCredentials(user)) {
			throw new Error(
				'Missing WebAuthn credentials. This account may have been created before credential storage was implemented.'
			);
		}

		const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';

		return this.webauthnService.createOwnerFromStoredCredentials(
			this.config.rpId,
			origin,
			user.credentialId!,
			user.publicKey!
		);
	}

	public async calculateAccountAddress(user: User): Promise<string> {
		try {
			const owner = this.createOwnerFromUserData(user);
			return await this.starknetService.calculateAccountAddress(this.config.classHash, owner);
		} catch (error) {
			console.error('Error calculating account address:', error);
			throw error;
		}
	}

	public async checkAccountDeployment(accountAddress: string): Promise<AccountStatus> {
		try {
			const result = await this.starknetService.checkAccountDeployment(
				accountAddress,
				this.getOrCreateProvider()
			);

			return {
				isDeployed: result.isDeployed,
				balance: result.balance || get(_)('client.starknet.balance_unavailable'),
				address: accountAddress
			};
		} catch (error) {
			console.error('Error checking deployment:', error);
			return {
				isDeployed: false,
				address: accountAddress
			};
		}
	}

	public async deployAccount(
		user: User,
		paymentMethod: PaymentMethod = PaymentMethod.PAYMASTER_SPONSORED
	): Promise<AccountDeploymentResult> {
		try {
			const owner = this.createOwnerFromUserData(user);

			const deployedAccount = await this.starknetService.deployAccount({
				classHash: this.config.classHash,
				owner,
				provider: this.getOrCreateProvider(),
				paymentMethod
			});

			// Public key is now set during deployment in the constructor
			// No need to call setAccountPublicKey separately
			console.log('✅ Account deployed successfully with public key set');

			return {
				success: true,
				account: deployedAccount
			};
		} catch (error) {
			console.error('Account deployment error:', error);
			return {
				success: false,
				error: error instanceof Error ? error.message : get(_)('client.starknet.deployment_failed')
			};
		}
	}

	public getConfig(): WebauthnAccountConfig {
		return { ...this.config };
	}

	public getProvider(): RpcProvider {
		return this.getOrCreateProvider();
	}
}
