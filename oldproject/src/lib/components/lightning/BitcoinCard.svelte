<!--
  @component
  Bitcoin On-Chain Payment Card
  
  Dedicated card component for Bitcoin on-chain payments with Bitcoin-specific
  theming, content, and payment flow. Features gold/bitcoin visual theme
  and secure blockchain messaging.
  
  @prop starknetAddress - User's Starknet wallet address
  @prop onPaymentComplete - Callback when payment completes
  @prop onError - Callback for error handling
  
  @author bim
  @version 1.0.0
-->

<script lang="ts">
	import type { SwapStatus } from '$lib/services/client/lightning.client.service';
	import { createEventDispatcher, onDestroy } from 'svelte';
	// Import existing components that we'll reuse
	import AmountInput from './AmountInput.svelte';
	import ClaimingComponent from './ClaimingComponent.svelte';
	import PaymentDisplay from './PaymentDisplay.svelte';
	import PaymentGenerator from './PaymentGenerator.svelte';
	import PaymentStatusTracker from './PaymentStatusTracker.svelte';

	// Component props
	export let starknetAddress: string;
	export let onPaymentComplete: (status: SwapStatus) => void = () => {};
	export let onError: (error: string) => void = () => {};

	// State preservation props
	export let initialAmount = 0;
	export let initialDestinationAsset = 'WBTC';

	// Event dispatcher
	const dispatch = createEventDispatcher();

	// Bitcoin-specific state
	let destinationAsset = initialDestinationAsset;
	let amount = initialAmount;
	let currentPayment: any = null;
	let swapStatus: SwapStatus | null = null;
	let errorMessage = '';

	// Copy functionality state
	let copySuccess = '';
	let copyTimeout: NodeJS.Timeout | null = null;

	// Component references
	// let paymentGenerator: PaymentGenerator;
	let paymentStatusTracker: PaymentStatusTracker;
	// let claimingComponent: ClaimingComponent;

	// Available destination assets
	const SUPPORTED_ASSETS = ['WBTC'];

	// Track previous initial values to detect actual changes from parent
	let prevInitialAmount = initialAmount;
	let prevInitialDestinationAsset = initialDestinationAsset;

	// Only update local state when initial props actually change from parent
	// (not when user is typing and amount !== initialAmount)
	$: if (initialAmount !== prevInitialAmount) {
		amount = initialAmount;
		prevInitialAmount = initialAmount;
	}
	$: if (initialDestinationAsset !== prevInitialDestinationAsset) {
		destinationAsset = initialDestinationAsset;
		prevInitialDestinationAsset = initialDestinationAsset;
	}

	/**
	 * Component lifecycle cleanup
	 */
	onDestroy(() => {
		if (paymentStatusTracker) {
			paymentStatusTracker.stopMonitoring();
		}
	});

	/**
	 * Event handlers
	 */
	function handleAmountChange(newAmount: number) {
		amount = newAmount;
		// Dispatch to parent for state preservation
		dispatch('amountChange', { amount: newAmount });
	}

	function handleAssetChange(asset: string) {
		destinationAsset = asset;
		// Dispatch to parent for state preservation
		dispatch('assetChange', { asset, method: 'bitcoin' });
	}

	function handlePaymentGenerated(event: CustomEvent<{ payment: any }>) {
		currentPayment = event.detail.payment;
		errorMessage = '';
	}

	function handlePaymentError(event: CustomEvent<{ error: string }>) {
		errorMessage = event.detail.error;
		onError(event.detail.error);
	}

	function handleStatusUpdate(event: CustomEvent<{ status: SwapStatus }>) {
		swapStatus = event.detail.status;
	}

	function handlePaymentComplete(event: CustomEvent<{ status: SwapStatus }>) {
		onPaymentComplete(event.detail.status);
	}

	function handleClaimComplete(event: CustomEvent<{ status: SwapStatus }>) {
		swapStatus = event.detail.status;
		onPaymentComplete(event.detail.status);
	}

	/**
	 * Reset payment state
	 */
	function reset() {
		currentPayment = null;
		swapStatus = null;
		errorMessage = '';

		if (paymentStatusTracker) {
			paymentStatusTracker.stopMonitoring();
		}
	}

	/**
	 * Handle copy to clipboard
	 */
	function handleCopy(text: string) {
		if (navigator.clipboard && navigator.clipboard.writeText) {
			navigator.clipboard
				.writeText(text)
				.then(() => {
					showCopySuccess('Copied to clipboard!');
				})
				.catch(() => {
					// Fallback for older browsers
					fallbackCopy(text);
				});
		} else {
			fallbackCopy(text);
		}
	}

	/**
	 * Fallback copy method for older browsers
	 */
	function fallbackCopy(text: string) {
		const textArea = document.createElement('textarea');
		textArea.value = text;
		textArea.style.position = 'fixed';
		textArea.style.left = '-999999px';
		textArea.style.top = '-999999px';
		document.body.appendChild(textArea);
		textArea.focus();
		textArea.select();

		try {
			document.execCommand('copy');
			showCopySuccess('Copied to clipboard!');
		} catch (err) {
			showCopySuccess('Failed to copy');
			console.error('Fallback copy failed:', err);
		}

		document.body.removeChild(textArea);
	}

	/**
	 * Show copy success message
	 */
	function showCopySuccess(message: string) {
		copySuccess = message;
		if (copyTimeout) {
			clearTimeout(copyTimeout);
		}
		copyTimeout = setTimeout(() => {
			copySuccess = '';
		}, 2000);
	}
</script>

<div class="bitcoin-card">
	<!-- Bitcoin Card Header -->
	<div class="card-header">
		<div class="method-icon">₿</div>
		<div class="method-info">
			<h3 class="method-title">Bitcoin On-Chain</h3>
			<p class="method-description">
				Secure blockchain transactions with full Bitcoin network validation and immutability.
			</p>
		</div>
	</div>

	<!-- Asset Selection -->
	<div class="asset-section">
		<label for="bitcoin-asset" class="section-label">Receive Asset:</label>
		<div class="asset-selector">
			<select
				id="bitcoin-asset"
				bind:value={destinationAsset}
				on:change={() => handleAssetChange(destinationAsset)}
				class="asset-select"
			>
				{#each SUPPORTED_ASSETS as asset}
					<option value={asset}>{asset}</option>
				{/each}
			</select>
			<div class="select-arrow">▼</div>
		</div>
		<p class="asset-description">
			Your Bitcoin payment will be swapped to {destinationAsset} in your Starknet wallet.
		</p>
	</div>

	<!-- Amount Input -->
	<div class="amount-section">
		<AmountInput
			bind:amount
			{destinationAsset}
			paymentMethod="bitcoin"
			onAmountChange={handleAmountChange}
		/>
	</div>

	<!-- Payment Generator -->
	<div class="generator-section">
		<PaymentGenerator
			bind:this={paymentGenerator}
			{amount}
			paymentMethod="bitcoin"
			{destinationAsset}
			{starknetAddress}
			bind:currentPayment
			on:paymentGenerated={handlePaymentGenerated}
			on:error={handlePaymentError}
			on:reset={reset}
		/>
	</div>

	<!-- Payment Display -->
	{#if currentPayment}
		<div class="payment-section">
			<PaymentDisplay
				payment={currentPayment}
				paymentMethod="bitcoin"
				{destinationAsset}
				onCopy={handleCopy}
			/>

			<!-- Copy Success Message -->
			{#if copySuccess}
				<div class="copy-success">
					✅ {copySuccess}
				</div>
			{/if}

			<!-- Payment Status Tracker -->
			<PaymentStatusTracker
				bind:this={paymentStatusTracker}
				swapId={currentPayment?.swapId || ''}
				paymentMethod="bitcoin"
				on:statusUpdate={handleStatusUpdate}
				on:complete={handlePaymentComplete}
				on:error={handlePaymentError}
			/>

			<!-- Claiming Component -->
			{#if swapStatus?.status === 'paid'}
				<ClaimingComponent
					bind:this={claimingComponent}
					swapId={currentPayment.swapId}
					{destinationAsset}
					on:claimComplete={handleClaimComplete}
					on:error={handlePaymentError}
				/>
			{/if}
		</div>
	{/if}

	<!-- Error Display -->
	{#if errorMessage}
		<div class="error-section">
			<div class="error-message">
				<div class="error-icon">⚠️</div>
				<p>{errorMessage}</p>
			</div>
		</div>
	{/if}
</div>

<style>
	.bitcoin-card {
		padding: 1.5rem;
		background: linear-gradient(135deg, rgba(247, 147, 26, 0.05) 0%, rgba(255, 193, 7, 0.03) 100%);
		border: 1px solid rgba(247, 147, 26, 0.1);
		border-radius: 16px;
		position: relative;
		overflow: hidden;
		transform: translateZ(0);
		backface-visibility: hidden;
		-webkit-tap-highlight-color: transparent;
		touch-action: pan-x pan-y;
	}

	.bitcoin-card::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 4px;
		background: linear-gradient(90deg, #f7931a 0%, #ffb74d 100%);
		border-radius: 16px 16px 0 0;
	}

	.card-header {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-bottom: 1.5rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid rgba(247, 147, 26, 0.1);
	}

	.method-icon {
		font-size: 2.5rem;
		color: #f7931a;
		text-shadow: 0 0 20px rgba(247, 147, 26, 0.3);
		animation: bitcoin-glow 3s ease-in-out infinite;
	}

	@keyframes bitcoin-glow {
		0%,
		100% {
			transform: scale(1);
			filter: brightness(1) drop-shadow(0 0 10px rgba(247, 147, 26, 0.3));
		}
		50% {
			transform: scale(1.02);
			filter: brightness(1.1) drop-shadow(0 0 15px rgba(247, 147, 26, 0.5));
		}
	}

	.method-info {
		flex: 1;
	}

	.method-title {
		margin: 0 0 0.5rem 0;
		font-size: 1.5rem;
		font-weight: 700;
		color: #f7931a;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
	}

	.method-description {
		margin: 0;
		color: var(--color-text-secondary, #666);
		font-size: 0.9rem;
		line-height: 1.4;
	}

	.asset-section,
	.amount-section,
	.generator-section,
	.payment-section {
		margin-bottom: 1.5rem;
	}

	.section-label {
		display: block;
		font-weight: 600;
		margin-bottom: 0.5rem;
		color: var(--color-text, #333);
		font-size: 0.9rem;
	}

	.asset-selector {
		position: relative;
		display: flex;
		align-items: center;
	}

	.asset-select {
		flex: 1;
		padding: 0.75rem 2.5rem 0.75rem 1rem;
		border: 2px solid rgba(247, 147, 26, 0.2);
		border-radius: 8px;
		background: white;
		font-size: 1rem;
		color: var(--color-text, #333);
		cursor: pointer;
		transition: all 0.2s ease;
		appearance: none;
	}

	.asset-select:focus {
		outline: none;
		border-color: #f7931a;
		box-shadow: 0 0 0 3px rgba(247, 147, 26, 0.1);
	}

	.select-arrow {
		position: absolute;
		right: 1rem;
		color: #f7931a;
		pointer-events: none;
		font-size: 0.8rem;
	}

	.asset-description {
		margin: 0.5rem 0 0 0;
		font-size: 0.8rem;
		color: var(--color-text-secondary, #666);
		font-style: italic;
	}

	.error-section {
		margin-top: 1rem;
	}

	.error-message {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		background: rgba(244, 67, 54, 0.05);
		border: 1px solid rgba(244, 67, 54, 0.2);
		border-radius: 8px;
		padding: 1rem;
	}

	.error-icon {
		font-size: 1.25rem;
		flex-shrink: 0;
	}

	.error-message p {
		margin: 0;
		color: #f44336;
		font-size: 0.9rem;
		line-height: 1.4;
	}

	.copy-success {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		background: rgba(76, 175, 80, 0.1);
		border: 1px solid rgba(76, 175, 80, 0.3);
		border-radius: 8px;
		padding: 0.75rem;
		margin: 1rem 0;
		color: #4caf50;
		font-size: 0.9rem;
		font-weight: 500;
		animation: fadeInOut 2s ease-in-out;
	}

	@keyframes fadeInOut {
		0% {
			opacity: 0;
			transform: translateY(-10px);
		}
		20% {
			opacity: 1;
			transform: translateY(0);
		}
		80% {
			opacity: 1;
			transform: translateY(0);
		}
		100% {
			opacity: 0;
			transform: translateY(-10px);
		}
	}

	/* Mobile optimizations */
	@media (max-width: 640px) {
		.bitcoin-card {
			padding: 1.25rem;
		}

		.card-header {
			flex-direction: column;
			text-align: center;
			gap: 0.75rem;
		}

		.method-icon {
			font-size: 2rem;
		}

		.method-title {
			font-size: 1.25rem;
		}
	}

	/* Dark mode support */
	@media (prefers-color-scheme: dark) {
		.bitcoin-card {
			background: linear-gradient(
				135deg,
				rgba(247, 147, 26, 0.08) 0%,
				rgba(255, 193, 7, 0.05) 100%
			);
			border-color: rgba(247, 147, 26, 0.2);
		}

		.asset-select {
			background: var(--color-surface, #2a2a2a);
			border-color: rgba(247, 147, 26, 0.3);
			color: var(--color-text, #fff);
		}
	}

	/* Reduced motion */
	@media (prefers-reduced-motion: reduce) {
		.method-icon {
			animation: none;
		}

		.asset-select {
			transition: none;
		}
	}

	/* High contrast mode */
	@media (prefers-contrast: high) {
		.bitcoin-card {
			border-color: #f7931a;
		}

		.asset-select:focus {
			outline: 2px solid #f7931a;
			outline-offset: 2px;
		}
	}
</style>
