<script lang="ts">
	import type { User } from '$lib/db';
	import LoadingSpinner from '$lib/components/ui/LoadingSpinner.svelte';
	import { useAccountDeployment } from '$lib/composables/useAccountDeployment';
	import UserInfo from './UserInfo.svelte';
	import MissingCredentials from './MissingCredentials.svelte';
	import AccountStatus from './AccountStatus.svelte';
	import DeploymentInterface from './DeploymentInterface.svelte';

	export let user: User;

	// Use the composable for all account deployment logic
	const {
		state,
		hasRequiredCredentials,
		isAccountDeployed,
		canDeploy,
		deployAccount,
		checkDeploymentStatus
	} = useAccountDeployment(user);

	function handleDeploy() {
		deployAccount({
			onSuccess: (account) => {
				console.log('Account deployed successfully:', account);
			},
			onError: (error) => {
				console.error('Deployment failed:', error);
			}
		});
	}

	function handlePaymentComplete(status: any) {
		console.log('Lightning payment completed:', status);
		// Refresh account balance
		checkDeploymentStatus();
	}

	function handlePaymentError(error: string) {
		console.error('Lightning payment error:', error);
	}
</script>

<div class="deployment-container">
	<h2>Deploy Starknet Account</h2>

	<UserInfo {user} />

	{#if $state.error}
		<div class="error">{$state.error}</div>
	{/if}

	{#if !$hasRequiredCredentials}
		<MissingCredentials {user} />
	{:else if $state.phase === 'checking'}
		<div class="checking-deployment">
			<h3>🔍 Checking Account Status...</h3>
			<LoadingSpinner text="Verifying if your Starknet account is already deployed..." />
		</div>
	{:else if $isAccountDeployed && $state.accountStatus}
		<AccountStatus
			status={$state.accountStatus}
			onPaymentComplete={handlePaymentComplete}
			onPaymentError={handlePaymentError}
		/>
	{:else if $state.phase === 'ready'}
		<DeploymentInterface state={$state} canDeploy={$canDeploy} onDeploy={handleDeploy} />
	{:else if $state.deployedAccount}
		<div class="success">
			<h3>✅ Account Successfully Deployed!</h3>
			<div class="account-details">
				<div><strong>Account Address:</strong></div>
				<div class="address">{$state.deployedAccount.address}</div>
			</div>
			<p>Your Starknet account is now ready to use!</p>
			<p class="redirect-message">Redirecting to home page...</p>
		</div>
	{/if}
</div>

<style>
	.deployment-container {
		background: #2d2d2d;
		padding: 24px;
	}

	.redirect-message {
		color: #888;
		font-style: italic;
		margin-top: 12px;
		border-radius: 12px;
		margin: 20px 0;
		max-width: 600px;
		margin-left: auto;
		margin-right: auto;
		border: 1px solid #404040;
	}

	h2 {
		text-align: center;
		margin-bottom: 20px;
		color: #ffffff;
	}

	.error {
		background: #4a1a1a;
		color: #fca5a5;
		padding: 12px 16px;
		border: 1px solid #7a2a2a;
		border-radius: 6px;
		margin-bottom: 16px;
		font-size: 14px;
	}

	.checking-deployment {
		background: #1a3a4a;
		padding: 24px;
		border-radius: 8px;
		border: 1px solid #2a5a7a;
		text-align: center;
	}

	.checking-deployment h3 {
		margin-top: 0;
		color: #60a5fa;
	}

	.success {
		background: #1a4a1a;
		padding: 20px;
		border-radius: 8px;
		border: 1px solid #2d5a2d;
		text-align: center;
	}

	.success h3 {
		margin-top: 0;
		color: #4ade80;
	}

	.account-details {
		background: #1e1e1e;
		padding: 16px;
		border-radius: 6px;
		margin: 16px 0;
		text-align: left;
		border: 1px solid #404040;
	}

	.address {
		font-family: monospace;
		font-size: 12px;
		word-break: break-all;
		background: #121212;
		padding: 8px;
		border-radius: 4px;
		margin-top: 8px;
		color: #b0b0b0;
		border: 1px solid #404040;
	}

	/* Mobile styles */
	@media (max-width: 767px) {
		.deployment-container {
			margin: 10px;
			padding: 16px;
			border-radius: 8px;
		}

		h2 {
			font-size: 20px;
			margin-bottom: 16px;
		}

		.checking-deployment {
			padding: 16px;
			margin: 12px 0;
		}

		.checking-deployment h3 {
			font-size: 18px;
			margin-bottom: 12px;
		}
	}

	/* Tablet styles */
	@media (min-width: 768px) and (max-width: 1023px) {
		.deployment-container {
			margin: 15px;
			padding: 20px;
		}
	}
</style>
