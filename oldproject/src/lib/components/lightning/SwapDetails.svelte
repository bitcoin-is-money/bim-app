<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import LoadingSpinner from '$lib/components/ui/LoadingSpinner.svelte';
	import type { StarknetToLightningSwap } from '$lib/services/client/lightning.client.service';
	import type { SwapPhase, SourceAsset } from '$lib/composables/useStarknetToLightningSwap';

	export let swap: StarknetToLightningSwap;
	export let sourceAsset: SourceAsset;
	export let swapPhase: SwapPhase;
	export let transactionProgress: string;
	export let isExecutingTransactions: boolean;
	export let onReset: () => void;
	export let formatEstimatedOutput: (sats: number) => string;

	function getProgressIcon(phase: SwapPhase): string {
		switch (phase) {
			case 'signing':
				return '🔐';
			case 'submitting':
				return '🚀';
			default:
				return '⏳';
		}
	}

	function getProgressTitle(phase: SwapPhase): string {
		switch (phase) {
			case 'signing':
				return 'Signing Transaction';
			case 'submitting':
				return 'Submitting Transaction';
			default:
				return 'Preparing Transaction';
		}
	}

	function getProgressDescription(phase: SwapPhase): string {
		switch (phase) {
			case 'signing':
				return transactionProgress;
			case 'submitting':
				return transactionProgress;
			default:
				return 'Getting ready to sign...';
		}
	}
</script>

<Card>
	<div class="swap-details">
		<h3>Starknet to Lightning Swap</h3>

		<div class="swap-info">
			<div class="info-row">
				<span class="label">Swap ID:</span>
				<span class="value">{swap.swapId}</span>
			</div>

			<div class="info-row">
				<span class="label">Source Asset:</span>
				<span class="value">{sourceAsset}</span>
			</div>

			<div class="info-row">
				<span class="label">Estimated Output:</span>
				<span class="value">{formatEstimatedOutput(swap.estimatedOutput)} BTC</span>
			</div>

			<div class="info-row">
				<span class="label">Fees:</span>
				<span class="value">{swap.fees.total} sats</span>
			</div>

			<div class="info-row">
				<span class="label">Expires:</span>
				<span class="value">{new Date(swap.expiresAt).toLocaleString()}</span>
			</div>
		</div>

		<!-- Transaction Progress -->
		{#if swapPhase === 'created' || swapPhase === 'signing' || swapPhase === 'submitting'}
			<div class="transaction-progress">
				<h4>Transaction Progress</h4>

				<div class="progress-step active">
					<div class="step-icon">{getProgressIcon(swapPhase)}</div>
					<div class="step-content">
						<div class="step-title">{getProgressTitle(swapPhase)}</div>
						<div class="step-description">
							{getProgressDescription(swapPhase)}
						</div>
					</div>
				</div>

				{#if isExecutingTransactions}
					<div class="loading-spinner">
						<LoadingSpinner size="small" />
					</div>
				{/if}
			</div>
		{/if}

		<!-- Success State -->
		{#if swapPhase === 'completed'}
			<div class="success-state">
				<div class="success-icon">🎉</div>
				<h4>Swap Completed Successfully!</h4>
				<p>
					Your Starknet assets have been swapped and Bitcoin has been sent via Lightning Network.
				</p>
				<div class="success-details">
					<div class="detail-item">
						<span class="label">Lightning Payment:</span>
						<span class="value">✅ Sent</span>
					</div>
				</div>
			</div>
		{/if}

		<!-- Reset Button -->
		<Button on:click={onReset} class="reset-btn">Create New Swap</Button>
	</div>
</Card>

<style>
	.swap-details {
		padding: 20px;
	}

	.swap-details h3 {
		margin-top: 0;
		margin-bottom: 16px;
		color: #fff;
		font-size: 1.5rem;
		font-weight: 600;
	}

	.swap-info {
		margin-bottom: 24px;
	}

	.info-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 8px 0;
		border-bottom: 1px solid #333;
	}

	.info-row:last-child {
		border-bottom: none;
	}

	.label {
		color: #b0b0b0;
		font-weight: 500;
	}

	.value {
		color: #fff;
		font-weight: 600;
	}

	.reset-btn {
		width: 100%;
		margin-top: 1rem;
	}

	/* Transaction Progress Styles */
	.transaction-progress {
		margin-top: 24px;
		padding: 16px;
		background: #1a1a1a;
		border-radius: 8px;
		border: 1px solid #333;
	}

	.transaction-progress h4 {
		margin-top: 0;
		margin-bottom: 16px;
		color: #fff;
		font-size: 1.1rem;
		font-weight: 600;
	}

	.progress-step {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 12px;
		background: #0a0a0a;
		border-radius: 8px;
		margin-bottom: 12px;
	}

	.progress-step.active {
		border: 1px solid #44ff44;
		box-shadow: 0 0 10px rgba(68, 255, 68, 0.2);
	}

	.step-icon {
		font-size: 1.5rem;
		flex-shrink: 0;
	}

	.step-content {
		flex: 1;
	}

	.step-title {
		color: #fff;
		font-weight: 600;
		margin-bottom: 4px;
	}

	.step-description {
		color: #b0b0b0;
		font-size: 0.9rem;
	}

	.loading-spinner {
		display: flex;
		justify-content: center;
		margin-top: 16px;
	}

	/* Success State Styles */
	.success-state {
		margin-top: 24px;
		padding: 20px;
		background: #1b2d1b;
		border: 1px solid #44ff44;
		border-radius: 8px;
		text-align: center;
	}

	.success-icon {
		font-size: 3rem;
		margin-bottom: 16px;
	}

	.success-state h4 {
		color: #44ff44;
		font-size: 1.2rem;
		font-weight: 600;
		margin-bottom: 12px;
	}

	.success-state p {
		color: #b0b0b0;
		margin-bottom: 16px;
	}

	.success-details {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.detail-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 8px 0;
		border-bottom: 1px solid #2d4d2d;
	}

	.detail-item:last-child {
		border-bottom: none;
	}

	.detail-item .label {
		color: #b0b0b0;
		font-weight: 500;
	}

	.detail-item .value {
		color: #44ff44;
		font-weight: 600;
	}

	/* Responsive design */
	@media (max-width: 768px) {
		.swap-details {
			padding: 16px;
		}

		.info-row {
			flex-direction: column;
			align-items: flex-start;
			gap: 4px;
		}
	}
</style>
