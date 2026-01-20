<!--
  @component
  Swipeable Payment Method Selector
  
  Touch-friendly payment method selector that supports swipe gestures
  to switch between Lightning and Bitcoin payment methods. Includes
  smooth animations, visual feedback, and accessibility support.
  
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
	import type { SwipeCallbacks } from '$lib/utils/swipe-gestures';
	import { swipe } from '$lib/utils/swipe-gestures';
	import { createEventDispatcher, onDestroy, onMount } from 'svelte';

	// Component props
	export let paymentMethod: 'lightning' | 'bitcoin' = 'lightning';
	export let destinationAsset = 'WBTC';
	export let amount = 0;
	export let limits: LightningLimits | null = null;
	export let estimatedOutput = 0;

	// Event dispatcher
	const dispatch = createEventDispatcher();

	// Available destination assets
	const SUPPORTED_ASSETS = ['WBTC'];

	// Animation and UI state
	let containerElement: HTMLElement;
	let isDragging = false;
	let dragOffset = 0;
	let swipeProgress = 0; // -1 to 1, representing swipe progress
	let isAnimating = false;

	// Touch feedback
	let showSwipeHint = true;
	let hintTimeout: number | null = null;

	/**
	 * Handle payment method selection
	 */
	function handleMethodChange(method: 'lightning' | 'bitcoin', fromSwipe = false) {
		if (method === paymentMethod || isAnimating) return;

		isAnimating = true;
		paymentMethod = method;

		// Dispatch change event
		dispatch('change', { method, asset: destinationAsset });

		// Reset swipe state after animation
		setTimeout(() => {
			isAnimating = false;
			swipeProgress = 0;
			dragOffset = 0;
		}, 300);

		// Hide hint after first interaction
		if (showSwipeHint) {
			showSwipeHint = false;
			if (hintTimeout) {
				clearTimeout(hintTimeout);
			}
		}
	}

	/**
	 * Handle destination asset selection
	 */
	function handleAssetChange(asset: string) {
		destinationAsset = asset;
		dispatch('change', { method: paymentMethod, asset });
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

	/**
	 * Keyboard event handler
	 */
	function handleKeydown(event: KeyboardEvent) {
		if (isAnimating) return;

		switch (event.key) {
			case 'ArrowLeft':
				event.preventDefault();
				if (paymentMethod === 'bitcoin') {
					handleMethodChange('lightning');
				}
				break;
			case 'ArrowRight':
				event.preventDefault();
				if (paymentMethod === 'lightning') {
					handleMethodChange('bitcoin');
				}
				break;
			case ' ':
			case 'Enter':
				event.preventDefault();
				const newMethod = paymentMethod === 'lightning' ? 'bitcoin' : 'lightning';
				handleMethodChange(newMethod);
				break;
		}
	}

	/**
	 * Swipe gesture callbacks
	 */
	const swipeCallbacks: SwipeCallbacks = {
		onSwipeStart: () => {
			isDragging = true;
			if (hintTimeout) {
				clearTimeout(hintTimeout);
			}
		},

		onSwipeMove: (coords, delta) => {
			if (isAnimating) return;

			// Calculate swipe progress (-1 to 1)
			const maxSwipe = 100;
			swipeProgress = Math.max(-1, Math.min(1, delta.x / maxSwipe));
			dragOffset = delta.x;

			// Hide hint during active swipe
			if (showSwipeHint) {
				showSwipeHint = false;
			}
		},

		onSwipeEnd: (result) => {
			isDragging = false;

			if (result && Math.abs(result.distance) > 50) {
				// Successful swipe
				if (result.direction === 'left' && paymentMethod === 'lightning') {
					handleMethodChange('bitcoin', true);
				} else if (result.direction === 'right' && paymentMethod === 'bitcoin') {
					handleMethodChange('lightning', true);
				}
			} else {
				// Snap back to original position
				swipeProgress = 0;
				dragOffset = 0;
			}
		},

		onTap: () => {
			// Toggle method on tap
			const newMethod = paymentMethod === 'lightning' ? 'bitcoin' : 'lightning';
			handleMethodChange(newMethod);
		}
	};

	/**
	 * Show hint initially, then hide after delay
	 */
	onMount(() => {
		hintTimeout = window.setTimeout(() => {
			showSwipeHint = false;
		}, 3000);
	});

	/**
	 * Cleanup
	 */
	onDestroy(() => {
		if (hintTimeout) {
			clearTimeout(hintTimeout);
		}
	});

	// Reactive styles for swipe animation
	$: containerTransform = `translateX(${dragOffset * 0.1}px)`;
	$: lightningOpacity = paymentMethod === 'lightning' ? 1 : 0.6 + Math.max(0, swipeProgress * 0.4);
	$: bitcoinOpacity = paymentMethod === 'bitcoin' ? 1 : 0.6 + Math.max(0, -swipeProgress * 0.4);
	$: lightningScale = paymentMethod === 'lightning' ? 1 : 0.95 + Math.max(0, swipeProgress * 0.05);
	$: bitcoinScale = paymentMethod === 'bitcoin' ? 1 : 0.95 + Math.max(0, -swipeProgress * 0.05);
</script>

<div class="swipeable-payment-selector">
	<div
		class="swipe-container"
		bind:this={containerElement}
		use:swipe={{
			callbacks: swipeCallbacks,
			options: { minSwipeDistance: 30, preventScroll: true }
		}}
		on:keydown={handleKeydown}
		tabindex="0"
		role="tablist"
		aria-label="Payment method selector"
		style="transform: {containerTransform}"
	>
		<!-- Swipe hint overlay -->
		{#if showSwipeHint}
			<div class="swipe-hint" class:fade-out={!showSwipeHint}>
				<span class="hint-text">👈 Swipe to switch 👉</span>
			</div>
		{/if}

		<!-- Payment method indicators -->
		<div class="method-indicators">
			<div
				class="method-indicator lightning"
				class:active={paymentMethod === 'lightning'}
				class:dragging={isDragging}
				style="opacity: {lightningOpacity}; transform: scale({lightningScale})"
				role="tab"
				aria-selected={paymentMethod === 'lightning'}
				aria-label="Lightning Network payment method"
			>
				<div class="method-icon">⚡</div>
				<div class="method-info">
					<div class="method-title">Lightning</div>
					<div class="method-description">
						{getMethodDescription('lightning')}
					</div>
				</div>
			</div>

			<div
				class="method-indicator bitcoin"
				class:active={paymentMethod === 'bitcoin'}
				class:dragging={isDragging}
				style="opacity: {bitcoinOpacity}; transform: scale({bitcoinScale})"
				role="tab"
				aria-selected={paymentMethod === 'bitcoin'}
				aria-label="Bitcoin on-chain payment method"
			>
				<div class="method-icon">₿</div>
				<div class="method-info">
					<div class="method-title">Bitcoin</div>
					<div class="method-description">
						{getMethodDescription('bitcoin')}
					</div>
				</div>
			</div>
		</div>

		<!-- Active method indicator -->
		<div
			class="active-indicator"
			class:lightning-active={paymentMethod === 'lightning'}
			class:bitcoin-active={paymentMethod === 'bitcoin'}
		></div>

		<!-- Swipe progress indicator -->
		<div class="swipe-progress">
			<div class="progress-bar" style="transform: translateX({swipeProgress * 50}%)"></div>
		</div>
	</div>

	<!-- Asset selector -->
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

	<!-- Limits info -->
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
	.swipeable-payment-selector {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		user-select: none;
	}

	.swipe-container {
		position: relative;
		background: var(--color-surface-variant, #f5f5f5);
		border-radius: 12px;
		padding: 1rem;
		cursor: pointer;
		transition: transform 0.1s ease-out;
		outline: none;
		overflow: hidden;
	}

	.swipe-container:focus {
		outline: 2px solid var(--color-primary, #f69413);
		outline-offset: 2px;
	}

	.swipe-hint {
		position: absolute;
		top: -30px;
		left: 50%;
		transform: translateX(-50%);
		background: rgba(0, 0, 0, 0.8);
		color: white;
		padding: 0.5rem 1rem;
		border-radius: 20px;
		font-size: 0.75rem;
		font-weight: 500;
		z-index: 10;
		animation: pulse 2s infinite;
		pointer-events: none;
	}

	.swipe-hint.fade-out {
		animation: fadeOut 0.5s ease-out forwards;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 0.8;
			transform: translateX(-50%) scale(1);
		}
		50% {
			opacity: 1;
			transform: translateX(-50%) scale(1.05);
		}
	}

	@keyframes fadeOut {
		from {
			opacity: 0.8;
		}
		to {
			opacity: 0;
		}
	}

	.method-indicators {
		display: flex;
		justify-content: space-between;
		align-items: center;
		position: relative;
		z-index: 2;
	}

	.method-indicator {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem;
		border-radius: 8px;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		flex: 1;
		margin: 0 0.5rem;
	}

	.method-indicator.active {
		background: white;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
	}

	.method-indicator.dragging {
		transition:
			opacity 0.1s ease-out,
			transform 0.1s ease-out;
	}

	.method-icon {
		font-size: 2rem;
		transition: all 0.3s ease;
	}

	.lightning .method-icon {
		color: var(--color-primary, #f69413);
	}

	.bitcoin .method-icon {
		color: #f7931a;
	}

	.method-info {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.method-title {
		font-weight: 600;
		font-size: 1.1rem;
		color: var(--color-text, #333);
	}

	.method-description {
		font-size: 0.8rem;
		color: var(--color-text-secondary, #666);
		opacity: 0.8;
	}

	.active-indicator {
		position: absolute;
		bottom: 0;
		left: 0;
		height: 3px;
		width: 50%;
		background: var(--color-primary, #f69413);
		border-radius: 2px;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		z-index: 1;
	}

	.active-indicator.bitcoin-active {
		transform: translateX(100%);
		background: #f7931a;
	}

	.swipe-progress {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 2px;
		background: rgba(0, 0, 0, 0.1);
		overflow: hidden;
	}

	.progress-bar {
		height: 100%;
		width: 100%;
		background: linear-gradient(90deg, var(--color-primary, #f69413) 0%, #f7931a 100%);
		transition: transform 0.1s ease-out;
	}

	.asset-selector {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.asset-selector label {
		font-weight: 500;
		min-width: fit-content;
		color: var(--color-text, #333);
	}

	.asset-selector select {
		flex: 1;
		padding: 0.75rem;
		border: 1px solid var(--color-border, #ddd);
		border-radius: 6px;
		background: white;
		font-size: 1rem;
		color: var(--color-text, #333);
		cursor: pointer;
		transition: border-color 0.2s ease;
	}

	.asset-selector select:focus {
		outline: none;
		border-color: var(--color-primary, #f69413);
	}

	.limits-info {
		display: flex;
		gap: 1rem;
		padding: 1rem;
		background: var(--color-surface-variant, #f9f9f9);
		border-radius: 8px;
		font-size: 0.875rem;
	}

	.limit-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		flex: 1;
	}

	.limit-label {
		font-weight: 500;
		opacity: 0.7;
		font-size: 0.75rem;
		text-transform: uppercase;
		color: var(--color-text-secondary, #666);
	}

	.limit-value {
		font-weight: 600;
		color: var(--color-primary, #f69413);
	}

	/* Mobile optimizations */
	@media (max-width: 640px) {
		.method-indicator {
			flex-direction: column;
			text-align: center;
			gap: 0.5rem;
			padding: 0.75rem;
			margin: 0 0.25rem;
		}

		.method-info {
			align-items: center;
		}

		.method-description {
			font-size: 0.7rem;
		}

		.limits-info {
			flex-direction: column;
			gap: 0.5rem;
		}

		.limit-item {
			flex-direction: row;
			justify-content: space-between;
		}

		.swipe-hint {
			font-size: 0.65rem;
			padding: 0.4rem 0.8rem;
		}
	}

	/* High contrast mode support */
	@media (prefers-contrast: high) {
		.method-indicator.active {
			border: 2px solid var(--color-text, #333);
		}

		.active-indicator {
			height: 4px;
		}
	}

	/* Reduced motion support */
	@media (prefers-reduced-motion: reduce) {
		.method-indicator,
		.active-indicator,
		.progress-bar,
		.swipe-container {
			transition: none;
		}

		.swipe-hint {
			animation: none;
		}
	}

	/* Touch device optimizations */
	@media (hover: none) and (pointer: coarse) {
		.swipe-container {
			padding: 1.25rem;
		}

		.method-indicator {
			padding: 1.25rem;
			min-height: 80px;
		}

		.method-icon {
			font-size: 2.2rem;
		}
	}

	/* Dark mode support */
	@media (prefers-color-scheme: dark) {
		.method-indicator.active {
			background: rgba(255, 255, 255, 0.1);
			box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
		}

		.asset-selector select {
			background: var(--color-surface, #2a2a2a);
			border-color: var(--color-border, #444);
			color: var(--color-text, #fff);
		}
	}
</style>
