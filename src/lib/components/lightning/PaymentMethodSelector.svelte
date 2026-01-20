<!--
  @component
  Payment Method Selection Component
  
  This component provides a focused UI for selecting between Lightning Network
  and Bitcoin on-chain payment methods, with associated limits and quotes.
  
  @prop paymentMethod - Currently selected payment method
  @prop destinationAsset - Target asset for the swap  
  @prop amount - Payment amount in satoshis
  @prop limits - Asset limits for validation
  @prop estimatedOutput - Estimated output amount
  @prop onMethodChange - Callback when payment method changes
  @prop onAssetChange - Callback when destination asset changes
  @prop onQuoteRefresh - Callback to refresh quote
  
  @author bim
  @version 1.0.0
-->

<script lang="ts">
	import type { LightningLimits } from '$lib/services/server/lightning-limits.service';

	// Component props
	export let paymentMethod: 'lightning' | 'bitcoin' = 'lightning';
	export let destinationAsset = 'WBTC';
	export let amount = 0;
	export let limits: LightningLimits | null = null;
	export let estimatedOutput = 0;
	export let onMethodChange: (method: 'lightning' | 'bitcoin') => void = () => {};
	export let onAssetChange: (asset: string) => void = () => {};
	export let onQuoteRefresh: () => void = () => {};

	// Available destination assets
	const SUPPORTED_ASSETS = ['WBTC'];

	/**
	 * Handle payment method selection
	 */
	function handleMethodChange(method: 'lightning' | 'bitcoin') {
		paymentMethod = method;
		onMethodChange(method);
		onQuoteRefresh();
	}

	/**
	 * Handle destination asset selection
	 */
	function handleAssetChange(asset: string) {
		destinationAsset = asset;
		onAssetChange(asset);
		onQuoteRefresh();
	}

	/**
	 * Format amount display
	 */
	function formatSats(sats: number): string {
		return new Intl.NumberFormat().format(sats);
	}

	/**
	 * Get payment method description
	 */
	function getMethodDescription(method: 'lightning' | 'bitcoin'): string {
		return method === 'lightning' ? 'Instant, low-fee payments' : 'On-chain Bitcoin transactions';
	}
</script>

<div class="payment-method-selector">
	<div class="method-tabs">
		<button
			class="method-tab"
			class:active={paymentMethod === 'lightning'}
			on:click={() => handleMethodChange('lightning')}
		>
			⚡ Lightning
			<span class="method-description">{getMethodDescription('lightning')}</span>
		</button>

		<button
			class="method-tab"
			class:active={paymentMethod === 'bitcoin'}
			on:click={() => handleMethodChange('bitcoin')}
		>
			₿ Bitcoin
			<span class="method-description">{getMethodDescription('bitcoin')}</span>
		</button>
	</div>

	<div class="asset-selector">
		<label for="destination-asset">Receive Asset:</label>
		<select
			id="destination-asset"
			bind:value={destinationAsset}
			on:change={() => handleAssetChange(destinationAsset)}
		>
			{#each SUPPORTED_ASSETS as asset}
				<option value={asset}>{asset}</option>
			{/each}
		</select>
	</div>

	{#if limits}
		<div class="limits-info">
			<div class="limit-item">
				<span class="limit-label">Min:</span>
				<span class="limit-value">{formatSats(limits.minAmount)} sats</span>
			</div>
			<div class="limit-item">
				<span class="limit-label">Max:</span>
				<span class="limit-value">{formatSats(limits.maxAmount)} sats</span>
			</div>
			{#if estimatedOutput > 0}
				<div class="limit-item">
					<span class="limit-label">Output:</span>
					<span class="limit-value">~{formatSats(estimatedOutput)} {destinationAsset}</span>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.payment-method-selector {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.method-tabs {
		display: flex;
		gap: 0.5rem;
		background: var(--color-surface-variant, #f5f5f5);
		padding: 0.25rem;
		border-radius: 8px;
	}

	.method-tab {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 0.75rem;
		background: transparent;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.2s ease;
		font-weight: 500;
		gap: 0.25rem;
	}

	.method-tab:hover {
		background: var(--color-surface-hover, #e8e8e8);
	}

	.method-tab.active {
		background: var(--color-primary, #0070f3);
		color: white;
	}

	.method-description {
		font-size: 0.75rem;
		opacity: 0.8;
		font-weight: 400;
	}

	.asset-selector {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.asset-selector label {
		font-weight: 500;
		min-width: fit-content;
	}

	.asset-selector select {
		flex: 1;
		padding: 0.5rem;
		border: 1px solid var(--color-border, #ddd);
		border-radius: 4px;
		background: white;
		font-size: 1rem;
	}

	.limits-info {
		display: flex;
		gap: 1rem;
		padding: 0.75rem;
		background: var(--color-surface-variant, #f9f9f9);
		border-radius: 6px;
		font-size: 0.875rem;
	}

	.limit-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
	}

	.limit-label {
		font-weight: 500;
		opacity: 0.7;
		font-size: 0.75rem;
		text-transform: uppercase;
	}

	.limit-value {
		font-weight: 600;
		color: var(--color-primary, #0070f3);
	}

	@media (max-width: 640px) {
		.method-tabs {
			flex-direction: column;
		}

		.limits-info {
			flex-direction: column;
			gap: 0.5rem;
		}

		.limit-item {
			flex-direction: row;
			justify-content: space-between;
		}
	}
</style>
