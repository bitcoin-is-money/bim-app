import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { PaymentMethod } from '$lib/config/avnu.config';
import type { User } from '$lib/db';
import type { AccountStatus } from '$lib/services/client/webauthn-account.service';
import { WebauthnAccountService } from '$lib/services/client/webauthn-account.service';
import { starknetAccountAddress } from '$lib/stores/starknet';
import { Account, ETransactionVersion3 } from 'starknet';
import { derived, get, writable } from 'svelte/store';
import { _ } from 'svelte-i18n';

export type DeploymentPhase = 'checking' | 'ready' | 'deploying' | 'deployed' | 'error';

export interface DeploymentState {
	phase: DeploymentPhase;
	isLoading: boolean;
	isEstimatingFee: boolean;
	error: string;
	accountAddress: string;
	accountStatus: AccountStatus | null;
	deployedAccount: Account | null;
}

export interface AccountDeploymentComposable {
	// Stores
	state: any; // Svelte writable store
	hasRequiredCredentials: any; // Svelte derived store
	isAccountDeployed: any; // Svelte derived store
	canDeploy: any; // Svelte derived store

	// Actions
	initializeAccount: () => Promise<void>;
	checkDeploymentStatus: (address?: string) => Promise<void>;
	deployAccount: (callbacks?: {
		onSuccess?: (account: Account) => void;
		onError?: (error: string) => void;
	}) => Promise<void>;
	getOrCreateAccount: () => Promise<Account | null>;
	reset: () => void;

	// Service access
	service: WebauthnAccountService;
}

export function useAccountDeployment(user: User): AccountDeploymentComposable {
	const service = new WebauthnAccountService();

	const state = writable<DeploymentState>({
		phase: 'checking',
		isLoading: false,
		isEstimatingFee: false,
		error: '',
		accountAddress: '',
		accountStatus: null,
		deployedAccount: null
	});

	// Derived states
	const hasRequiredCredentials = derived([state], () => service.validateUserCredentials(user));

	const isAccountDeployed = derived([state], ([s]) => s.accountStatus?.isDeployed || false);

	const canDeploy = derived(
		[hasRequiredCredentials, state],
		([hasCredentials, s]) => hasCredentials && !s.isLoading && s.phase === 'ready'
	);

	async function initializeAccount() {
		if (!service.validateUserCredentials(user)) {
			state.update((s) => ({
				...s,
				phase: 'error',
				error: get(_)('client.webauthn.missing_credentials')
			}));
			return;
		}

		try {
			// Calculate account address
			const address = await service.calculateAccountAddress(user);
			state.update((s) => ({ ...s, accountAddress: address }));

			// Update global store
			starknetAccountAddress.set(address);

			// Check deployment status
			await checkDeploymentStatus(address);
		} catch (error) {
			console.error('Error initializing account:', error);
			state.update((s) => ({
				...s,
				phase: 'error',
				error:
					error instanceof Error ? error.message : get(_)('client.starknet.initialization_failed'),
				accountAddress: ''
			}));
			starknetAccountAddress.set('');
		}
	}

	async function checkDeploymentStatus(address?: string) {
		const currentState = get(state);
		const accountAddress = address || currentState.accountAddress;

		if (!accountAddress) return;

		state.update((s) => ({ ...s, phase: 'checking' }));

		try {
			const status = await service.checkAccountDeployment(accountAddress);

			state.update((s) => ({
				...s,
				accountStatus: status,
				phase: status.isDeployed ? 'deployed' : 'ready'
			}));

			console.log(status.isDeployed ? '✅ Account deployed' : '❌ Account not deployed');

			// If account is deployed and we don't have an Account instance, create one
			if (status.isDeployed) {
				const currentState = get(state);
				if (!currentState.deployedAccount) {
					try {
						const owner = service.createOwnerFromUserData(user);
						const provider = service.getProvider();

						const account = new Account({
							provider,
							address: accountAddress,
							signer: owner.signer.variant.Webauthn,
							cairoVersion: '1', // Cairo version as string for v8.x compatibility
							transactionVersion: ETransactionVersion3.V3
						});

						state.update((s) => ({
							...s,
							deployedAccount: account
						}));

						console.log('✅ Account instance created and stored');
					} catch (error) {
						console.error('Failed to create account instance:', error);
					}
				}
			}
		} catch (error) {
			console.error('Error checking deployment:', error);
			state.update((s) => ({
				...s,
				accountStatus: { isDeployed: false, address: accountAddress },
				phase: 'ready'
			}));
		}
	}

	async function deployAccount(callbacks?: {
		onSuccess?: (account: Account) => void;
		onError?: (error: string) => void;
	}) {
		state.update((s) => ({
			...s,
			isLoading: true,
			phase: 'deploying',
			error: ''
		}));

		try {
			const result = await service.deployAccount(user, PaymentMethod.PAYMASTER_SPONSORED);

			if (result.success && result.account) {
				state.update((s) => ({
					...s,
					deployedAccount: result.account || null,
					phase: 'deployed',
					isLoading: false
				}));

				callbacks?.onSuccess?.(result.account);

				// Refresh account status
				await checkDeploymentStatus();

				// Redirect to home page after successful deployment
				if (browser) {
					console.log('Account deployed successfully, redirecting to home page...');
					// Small delay to show success message before redirect
					setTimeout(() => {
						goto('/homebis', { replaceState: true });
					}, 2000);
				}
			} else {
				const errorMessage = result.error || get(_)('client.starknet.deployment_failed');
				state.update((s) => ({
					...s,
					error: errorMessage,
					phase: 'error',
					isLoading: false
				}));

				callbacks?.onError?.(errorMessage);
			}
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : get(_)('client.starknet.deployment_failed');
			state.update((s) => ({
				...s,
				error: errorMessage,
				phase: 'error',
				isLoading: false
			}));

			callbacks?.onError?.(errorMessage);
		}
	}

	async function getOrCreateAccount(): Promise<Account | null> {
		if (!service.validateUserCredentials(user)) {
			console.error(get(_)('client.webauthn.missing_credentials_for_creation'));
			return null;
		}

		const currentState = get(state);

		// Return cached account if available
		if (currentState.deployedAccount) {
			return currentState.deployedAccount;
		}

		// Check if account is deployed
		if (!currentState.accountStatus?.isDeployed) {
			console.error(get(_)('client.starknet.cannot_create_account_not_deployed'));
			return null;
		}

		try {
			// Create account instance using the deployed address
			const owner = service.createOwnerFromUserData(user);
			const provider = service.getProvider();

			const account = new Account({
				provider,
				address: currentState.accountAddress,
				signer: owner.signer.variant.Webauthn,
				cairoVersion: '1', // Cairo version as string for v8.x compatibility
				transactionVersion: ETransactionVersion3.V3
			});

			// Store the account instance for future use
			state.update((s) => ({
				...s,
				deployedAccount: account
			}));

			return account;
		} catch (error) {
			console.error('Error creating account instance:', error);
			return null;
		}
	}

	function reset() {
		state.set({
			phase: 'checking',
			isLoading: false,
			isEstimatingFee: false,
			error: '',
			accountAddress: '',
			accountStatus: null,
			deployedAccount: null
		});
	}

	// Initialize on creation
	initializeAccount();

	return {
		// Stores
		state,
		hasRequiredCredentials,
		isAccountDeployed,
		canDeploy,

		// Actions
		initializeAccount,
		checkDeploymentStatus,
		deployAccount,
		getOrCreateAccount,
		reset,

		// Service access
		service
	};
}
