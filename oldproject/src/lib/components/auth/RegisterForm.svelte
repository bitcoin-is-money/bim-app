<script lang="ts">
	import { goto } from '$app/navigation';
	import Button from '$lib/components/ui/Button.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import LoadingSpinner from '$lib/components/ui/LoadingSpinner.svelte';
	import { PaymentMethod } from '$lib/config/avnu.config';
	import { PublicEnv } from '$lib/config/env';
	import { NETWORKS } from '$lib/constants';
	import { StarknetService, WebauthnService } from '$lib/services';
	import type { WebauthnOwner } from '$lib/utils/webauthn';
	import { RpcProvider } from 'starknet';
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';

	const rpId = PublicEnv.WEBAUTHN_RP_ID();
	const classHash = PublicEnv.BIM_ARGENT_050_ACCOUNT_CLASS_HASH();
	const provider = new RpcProvider({
		nodeUrl: NETWORKS.LOCALHOST.rpcUrl,
		specVersion: PublicEnv.STARKNET_SPEC_VERSION() as '0.9.0'
	});

	let webauthnService: WebauthnService;
	let starknetService: StarknetService;

	let username = '';
	let owner: WebauthnOwner | undefined;
	let isLoading = false;
	let error = '';
	let isDeploying = false;
	let deploymentError = '';
	let accountAddress = '';
	let deploymentSuccess = false;
	let invalidUsername = false;
	let showUsernameError = false;

	const handleCreateOwner = async () => {
		if (!username.trim() || username.trim() === $t('auth.chooseUsername')) {
			showUsernameError = true;
			setTimeout(() => (showUsernameError = false), 3000);
			return;
		}

		isLoading = true;
		error = '';
		deploymentError = '';

		try {
			// Create WebAuthn passkey and register user
			// Check if we're in browser environment before accessing window
			const origin = typeof window !== 'undefined' ? window.location.origin : `https://${rpId}`;
			owner = await webauthnService.createOwner(rpId, origin, username);

			// Automatically deploy Starknet account with gasless deployment
			isDeploying = true;

			try {
				console.log('Starting automatic Starknet account deployment...');

				const account = await starknetService.deployAccount({
					classHash,
					owner,
					provider,
					paymentMethod: PaymentMethod.PAYMASTER_SPONSORED
				});

				accountAddress = account.address;
				deploymentSuccess = true;
				console.log('Account deployed successfully:', accountAddress);
			} catch (deployErr) {
				console.error('Deployment error:', deployErr);
				deploymentError =
					deployErr instanceof Error ? deployErr.message : $t('auth.deploymentFailed');
			} finally {
				isDeploying = false;
			}
		} catch (err) {
			console.error('Account creation error:', err);
			error = err instanceof Error ? err.message : $t('auth.accountCreationFailed');
		} finally {
			isLoading = false;
		}
	};

	onMount(() => {
		// Initialize services only on client side
		webauthnService = WebauthnService.getInstance();
		starknetService = StarknetService.getInstance();
	});

	$: if (deploymentSuccess && accountAddress) {
		setTimeout(() => {
			goto('/homebis');
		}, 1500); // 1.5 seconds delay
	}
</script>

{#if showUsernameError}
	<div class="username-error-banner">
		{$t('auth.enterUsernameBeforeSignup')}
	</div>
{/if}

{#if !owner}
	<section class="register-section">
		{#if error}
			<div class="error">{error}</div>
		{/if}
		<Input
			type="text"
			placeholder={$t('auth.chooseYourUsername')}
			bind:value={username}
			required
			disabled={isLoading}
			class={invalidUsername ? 'input-invalid' : ''}
		/>
		<Button
			variant="primary"
			loading={isLoading || isDeploying}
			on:click={handleCreateOwner}
			class="signup-button"
		>
			{#if isLoading}
				{$t('auth.creatingAccount')}
			{:else if isDeploying}
				{$t('auth.deployingBimAccount')}
			{:else}
				{$t('auth.signUp')}
			{/if}
		</Button>
	</section>
{:else}
	<section class="register-section">
		<h2>✨ Bim account created</h2>
		{#if isDeploying}
			<div class="deployment-status">
				<LoadingSpinner text={$t('auth.deployingAccount')} />
			</div>
		{:else if deploymentSuccess && accountAddress}
			<div class="deployment-success">
				<h2>...and deployed!</h2>
			</div>
		{:else if deploymentError}
			<div class="deployment-error">
				<h4>⚠️ Deployment Issue</h4>
				<p>
					Your passkey was created successfully, but there was an issue deploying your Bim account:
				</p>
				<div class="error-message">{deploymentError}</div>
			</div>
		{/if}
	</section>
{/if}

<style>
	.register-section {
		background: var(--color-surface);
		padding: 0.8rem;
		border-radius: var(--radius-md);
		max-width: 340px;
		margin: 0.8rem;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.8rem;
		border: 1.5px solid var(--color-border);
	}
	h2 {
		margin: 0 0 0.1rem 0;
		color: var(--color-text);
		font-size: 1.5rem;
		font-weight: 700;
		text-align: left;
	}
	.register-description {
		text-align: left;
		color: var(--color-text-light);
		font-size: 0.95rem;
		line-height: 1.5;
		margin: 0 0 0.2rem 0;
	}
	.register-section Button {
		align-self: flex-start;
		min-width: 120px;
		color: white !important;
		/* Always show primary color, never shaded */
		opacity: 1;
		cursor: pointer;
		/* Override primary button styling for transparent background with white border */
		background: transparent !important;
		border: 1px solid white !important;
	}

	/* Override Button component's base styles with maximum specificity */
	.register-section :global(.btn) {
		background: transparent !important;
		border: 1px solid white !important;
		color: white !important;
	}

	/* Override primary variant styles with maximum specificity */
	.register-section :global(.btn-primary) {
		background: transparent !important;
		border: 1px solid white !important;
		color: white !important;
	}

	/* Override hover styles with maximum specificity */
	.register-section :global(.btn-primary:hover:not(:disabled)) {
		background: rgba(255, 255, 255, 0.1) !important;
		border: 1px solid white !important;
		color: white !important;
		transform: translateY(-1px);
		box-shadow: var(--shadow-md);
	}

	/* Additional override for any remaining conflicts */
	.register-section :global(button.btn.btn-primary) {
		background: transparent !important;
		border: 1px solid white !important;
		color: white !important;
	}

	/* Custom signup button styling with maximum specificity */
	.signup-button {
		background: transparent !important;
		border: 1px solid white !important;
		color: white !important;
	}

	.signup-button:hover {
		background: rgba(255, 255, 255, 0.1) !important;
		border: 1px solid white !important;
		color: white !important;
	}
	.error {
		color: var(--color-error);
		font-size: 0.95rem;
		margin-bottom: 0.5rem;
	}
	.user-details {
		margin: 0.5rem 0;
		font-size: 0.95rem;
		color: var(--color-text-light);
	}
	.deployment-status,
	.deployment-success,
	.deployment-error {
		margin-top: 1rem;
		font-size: 0.95rem;
	}
	.deployment-success h4,
	.deployment-error h4 {
		margin: 0 0 0.5rem 0;
	}
	.account-address {
		margin: 0.5rem 0;
		font-size: 0.95rem;
		color: var(--color-success);
	}
	.error-message {
		color: var(--color-error);
		font-size: 0.95rem;
		margin: 0.5rem 0;
	}
	:global(.register-section input::placeholder) {
		color: var(--color-text-light);
		opacity: 1;
	}
	/* Input shake animation */
	:global(.input-invalid) {
		animation: shake 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
		border-color: var(--color-primary);
	}
	/* Label color transition */
	:global(.input-invalid) + label,
	:global(label.input-invalid) {
		color: var(--color-primary) !important;
		transition: color 0.2s;
	}
	@keyframes shake {
		10%,
		90% {
			transform: translateX(-2px);
		}
		20%,
		80% {
			transform: translateX(4px);
		}
		30%,
		50%,
		70% {
			transform: translateX(-8px);
		}
		40%,
		60% {
			transform: translateX(8px);
		}
	}
	.username-error-banner {
		position: sticky;
		top: 0;
		left: 0;
		right: 0;
		margin: 0 auto;
		background: #bb3737;
		color: #fff;
		text-align: center;
		font-weight: 600;
		font-size: 1rem;
		padding: 1rem 0.5rem;
		z-index: 1001;
		max-width: 400px;
		border-radius: 0 0 8px 8px;
		margin-top: 0.5rem;
	}
</style>
