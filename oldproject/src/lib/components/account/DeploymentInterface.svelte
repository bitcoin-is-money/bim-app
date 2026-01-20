<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import LoadingSpinner from '$lib/components/ui/LoadingSpinner.svelte';
	import type { DeploymentState } from '$lib/composables/useAccountDeployment';

	export let state: DeploymentState;
	export let canDeploy: boolean;
	export let onDeploy: () => void;
</script>

<div class="deployment-section">
	<p>Deploy your Starknet account for free to start using the platform.</p>

	<div class="deployment-info">
		<div class="info-item">
			<strong>Class Hash:</strong>
			<div class="hash-value">
				{state.accountAddress ? 'Available' : 'Calculating...'}
			</div>
		</div>

		{#if state.accountAddress}
			<div class="info-item">
				<strong>Account Address:</strong>
				<div class="address-value">{state.accountAddress}</div>
			</div>
		{/if}
	</div>

	<!-- Gasless Deployment Info -->
	<div class="gasless-info">
		<div class="info-item">
			<strong>✅ Free Gasless Deployment</strong>
			<div class="gasless-description">Your account deployment is sponsored by AVNU paymaster!</div>
		</div>
	</div>

	{#if state.phase !== 'deploying'}
		<Button variant="primary" fullWidth disabled={!canDeploy} on:click={onDeploy}>
			Deploy Starknet Account
		</Button>
	{/if}

	{#if state.phase === 'deploying'}
		<div class="deploying">
			<LoadingSpinner text="Deploying your account... This may take a few moments." />
		</div>
	{/if}
</div>

<style>
	.deployment-section {
		text-align: center;
	}

	.deployment-section p {
		margin-bottom: 20px;
		color: #b0b0b0;
	}

	.deployment-info {
		background: #1e1e1e;
		padding: 16px;
		border-radius: 8px;
		margin: 16px 0;
		border: 1px solid #404040;
	}

	.info-item {
		margin-bottom: 12px;
	}

	.info-item:last-child {
		margin-bottom: 0;
	}

	.info-item strong {
		display: block;
		margin-bottom: 4px;
		color: #ffffff;
		font-size: 14px;
	}

	.hash-value,
	.address-value {
		font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
		font-size: 12px;
		background: #121212;
		padding: 8px;
		border-radius: 4px;
		word-break: break-all;
		color: #b0b0b0;
		border: 1px solid #404040;
	}

	.deploying {
		text-align: center;
		padding: 20px;
	}

	/* Gasless deployment info styles */
	.gasless-info {
		margin: 16px 0;
		background: #1a4a1a;
		border: 2px solid #2d5a2d;
		border-radius: 8px;
		padding: 16px;
	}

	.gasless-info .info-item strong {
		color: #4ade80;
		font-size: 16px;
		display: block;
		margin-bottom: 8px;
	}

	.gasless-description {
		color: #b0f0b0;
		font-size: 14px;
		line-height: 1.5;
		background: #1e1e1e;
		padding: 12px;
		border-radius: 6px;
		border: 1px solid #404040;
	}

	/* Mobile styles */
	@media (max-width: 767px) {
		.deployment-info {
			padding: 12px;
			margin: 12px 0;
		}

		.info-item strong {
			font-size: 15px;
		}

		.hash-value,
		.address-value {
			font-size: 11px;
			padding: 6px;
			word-break: break-all;
			overflow-wrap: break-word;
			line-height: 1.4;
		}

		.gasless-info {
			padding: 12px;
			margin: 12px 0;
		}

		.gasless-info .info-item strong {
			font-size: 15px;
		}

		.gasless-description {
			font-size: 13px;
			padding: 10px;
		}
	}
</style>
