<!--
  @component
  Swipeable Card Container
  
  Provides a full card-to-card swipe experience between Lightning and Bitcoin
  payment methods. Handles smooth transitions, animations, and gesture detection
  for an immersive mobile-first payment method selection.
  
  @prop paymentMethod - Currently active payment method
  @prop starknetAddress - User's Starknet wallet address
  @prop onPaymentComplete - Callback when payment flow completes
  @prop onError - Callback for error handling
  
  @author bim
  @version 1.0.0
-->

<script lang="ts">
	import Card from '$lib/components/ui/Card.svelte';
	import type { SwapStatus } from '$lib/services/client/lightning.client.service';
	import type { SwipeCallbacks } from '$lib/utils/swipe-gestures';
	import { swipe } from '$lib/utils/swipe-gestures';
	import { createEventDispatcher, onDestroy, onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import BitcoinCard from './BitcoinCard.svelte';
	import LightningCard from './LightningCard.svelte';
	import StarknetCard from './StarknetCard.svelte';

	// Component props
	export let paymentMethod: 'lightning' | 'bitcoin' | 'starknet' = 'lightning';
	export let starknetAddress: string;
	export let onPaymentComplete: (status: SwapStatus) => void = () => {};
	export let onError: (error: string) => void = () => {};

	// Persistent state for form preservation
	let persistentState = {
		amount: 0,
		bitcoinDestinationAsset: 'WBTC',
		lightningDestinationAsset: 'WBTC',
		starknetAsset: 'STRK'
	};

	// Event dispatcher
	const dispatch = createEventDispatcher();

	// Container and animation state
	let containerElement: HTMLElement;
	let isDragging = false;
	let dragOffset = 0;
	let swipeProgress = 0; // -1 to 1, for visual feedback during swipe
	let isAnimating = false;
	let rafId: number | null = null;
	let containerTransform = 'translate3d(0%, 0, 0)'; // Initial position: Lightning centered (first card)

	// Visual feedback
	let showSwipeHint = true;
	let hintTimeout: number | null = null;

	/**
	 * Handle amount changes from card components
	 */
	function handleAmountChange(event: CustomEvent<{ amount: number }>) {
		persistentState.amount = event.detail.amount;
	}

	/**
	 * Handle asset changes from card components
	 */
	function handleAssetChange(event: CustomEvent<{ asset: string; method: string }>) {
		if (event.detail.method === 'bitcoin') {
			persistentState.bitcoinDestinationAsset = event.detail.asset;
		} else if (event.detail.method === 'lightning') {
			persistentState.lightningDestinationAsset = event.detail.asset;
		} else if (event.detail.method === 'starknet') {
			persistentState.starknetAsset = event.detail.asset;
		}
	}

	/**
	 * Handle payment method change
	 */
	function handleMethodChange(method: 'lightning' | 'bitcoin' | 'starknet', fromSwipe = false) {
		if (method === paymentMethod || isAnimating) return;

		isAnimating = true;
		paymentMethod = method;

		// Dispatch change event to parent
		dispatch('methodChange', { method });

		// Reset animation state after transition
		setTimeout(() => {
			isAnimating = false;
			swipeProgress = 0;
			dragOffset = 0;
		}, 400);

		// Hide swipe hint after first interaction
		if (showSwipeHint) {
			showSwipeHint = false;
			if (hintTimeout) {
				clearTimeout(hintTimeout);
			}
		}
	}

	/**
	 * Handle keyboard navigation
	 */
	function handleKeydown(event: KeyboardEvent) {
		if (isAnimating) return;

		switch (event.key) {
			case $t('keys.arrowLeft'):
				event.preventDefault();
				// Cycle backwards: lightning <- bitcoin <- starknet <- lightning
				const prevMethod =
					paymentMethod === 'lightning'
						? 'starknet'
						: paymentMethod === 'bitcoin'
							? 'lightning'
							: 'bitcoin';
				handleMethodChange(prevMethod);
				break;
			case $t('keys.arrowRight'):
				event.preventDefault();
				// Cycle forwards: lightning -> bitcoin -> starknet -> lightning
				const nextMethod =
					paymentMethod === 'lightning'
						? 'bitcoin'
						: paymentMethod === 'bitcoin'
							? 'starknet'
							: 'lightning';
				handleMethodChange(nextMethod);
				break;
			case ' ':
			case $t('keys.enter'):
				event.preventDefault();
				// Space/Enter cycles forward
				const forwardMethod =
					paymentMethod === 'lightning'
						? 'bitcoin'
						: paymentMethod === 'bitcoin'
							? 'starknet'
							: 'lightning';
				handleMethodChange(forwardMethod);
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

			// Use requestAnimationFrame for smooth updates
			if (rafId) {
				cancelAnimationFrame(rafId);
			}

			rafId = requestAnimationFrame(() => {
				// Calculate swipe progress for visual feedback
				const maxSwipe = 120; // Optimized for responsive feedback
				swipeProgress = Math.max(-1, Math.min(1, delta.x / maxSwipe));
				dragOffset = Math.max(-15, Math.min(15, delta.x * 0.08)); // Smoother drag response

				// Hide hint during active swipe
				if (showSwipeHint) {
					showSwipeHint = false;
				}
			});
		},

		onSwipeEnd: (result) => {
			isDragging = false;

			// Cancel any pending animation frame
			if (rafId) {
				cancelAnimationFrame(rafId);
				rafId = null;
			}

			if (result && Math.abs(result.distance) > 50) {
				// Optimized threshold for smooth swiping
				// Successful swipe - switch cards with looping navigation
				if (result.direction === 'left') {
					// Swipe left: go to previous method (backwards cycle)
					const prevMethod =
						paymentMethod === 'lightning'
							? 'starknet'
							: paymentMethod === 'bitcoin'
								? 'lightning'
								: 'bitcoin';
					handleMethodChange(prevMethod, true);
				} else if (result.direction === 'right') {
					// Swipe right: go to next method (forward cycle)
					const nextMethod =
						paymentMethod === 'lightning'
							? 'bitcoin'
							: paymentMethod === 'bitcoin'
								? 'starknet'
								: 'lightning';
					handleMethodChange(nextMethod, true);
				}
			} else {
				// Smooth snap back to original position
				isAnimating = true;
				requestAnimationFrame(() => {
					swipeProgress = 0;
					dragOffset = 0;
					setTimeout(() => {
						isAnimating = false;
					}, 300);
				});
			}
		}
	};

	/**
	 * Show swipe hint initially
	 */
	onMount(() => {
		hintTimeout = window.setTimeout(() => {
			showSwipeHint = false;
		}, 4000);
	});

	/**
	 * Cleanup
	 */
	onDestroy(() => {
		if (hintTimeout) {
			clearTimeout(hintTimeout);
		}
		if (rafId) {
			cancelAnimationFrame(rafId);
		}
	});

	// Card positioning logic for 3-card carousel
	$: {
		// Position cards to center the active one with proper peek effect
		// Calculations based on 300% container width with 33.333% cards (no margins)
		let baseTransform;
		switch (paymentMethod) {
			case 'lightning':
				baseTransform = 0; // Lightning centered (first card)
				break;
			case 'bitcoin':
				baseTransform = -33.333; // Bitcoin centered (second card)
				break;
			case 'starknet':
				baseTransform = -66.666; // Starknet centered (third card)
				break;
			default:
				baseTransform = 0;
		}
		containerTransform = `translate3d(${baseTransform + dragOffset}%, 0, 0)`;
	}

	// Enhanced visual styling for peek effect
	$: lightningOpacity = paymentMethod === 'lightning' ? 1 : 0.6;
	$: bitcoinOpacity = paymentMethod === 'bitcoin' ? 1 : 0.6;
	$: starknetOpacity = paymentMethod === 'starknet' ? 1 : 0.6;
	$: lightningScale = paymentMethod === 'lightning' ? 1 : 0.92;
	$: bitcoinScale = paymentMethod === 'bitcoin' ? 1 : 0.92;
	$: starknetScale = paymentMethod === 'starknet' ? 1 : 0.92;
</script>

<div class="swipeable-card-container">
	<!-- Swipe hint overlay -->
	{#if showSwipeHint}
		<div class="swipe-hint" class:fade-out={!showSwipeHint}>
			<span class="hint-text">{$t('lightning.swipeToExplore')}</span>
		</div>
	{/if}

	<!-- Swipeable cards container -->
	<div
		class="cards-wrapper"
		class:dragging={isDragging}
		bind:this={containerElement}
		use:swipe={{
			callbacks: swipeCallbacks,
			options: { minSwipeDistance: 30, preventScroll: true, touchSlop: 15 }
		}}
		on:keydown={handleKeydown}
		tabindex="0"
		role="tabpanel"
		aria-label={$t('lightning.paymentMethodsSelector')}
		style="transform: {containerTransform}"
	>
		<!-- Lightning Card -->
		<div
			class="card-slot lightning-slot"
			class:active={paymentMethod === 'lightning'}
			class:dragging={isDragging}
			style="opacity: {lightningOpacity}; transform: scale({lightningScale})"
		>
			<!-- Dedicated swipe zones for better gesture detection -->
			<div class="swipe-zone swipe-zone-top"></div>
			<div class="swipe-zone swipe-zone-left"></div>
			<div class="swipe-zone swipe-zone-right"></div>

			{#if paymentMethod === 'lightning'}
				<Card>
					<LightningCard
						{starknetAddress}
						{onPaymentComplete}
						{onError}
						initialAmount={persistentState.amount}
						initialDestinationAsset={persistentState.lightningDestinationAsset}
						on:amountChange={handleAmountChange}
						on:assetChange={handleAssetChange}
						on:lightningClaimSuccess
					/>
				</Card>
			{:else}
				<Card>
					<div class="card-preview lightning-preview">
						<div class="preview-icon">⚡</div>
						<div class="preview-title">{$t('lightning.lightning')}</div>
						<div class="preview-description">
							{$t('lightning.instantPayments')}
						</div>
					</div>
				</Card>
			{/if}
		</div>

		<!-- Bitcoin Card -->
		<div
			class="card-slot bitcoin-slot"
			class:active={paymentMethod === 'bitcoin'}
			class:dragging={isDragging}
			style="opacity: {bitcoinOpacity}; transform: scale({bitcoinScale})"
		>
			<!-- Dedicated swipe zones for better gesture detection -->
			<div class="swipe-zone swipe-zone-top"></div>
			<div class="swipe-zone swipe-zone-left"></div>
			<div class="swipe-zone swipe-zone-right"></div>

			{#if paymentMethod === 'bitcoin'}
				<Card>
					<BitcoinCard
						{starknetAddress}
						{onPaymentComplete}
						{onError}
						initialAmount={persistentState.amount}
						initialDestinationAsset={persistentState.bitcoinDestinationAsset}
						on:amountChange={handleAmountChange}
						on:assetChange={handleAssetChange}
					/>
				</Card>
			{:else}
				<Card>
					<div class="card-preview bitcoin-preview">
						<div class="preview-icon">₿</div>
						<div class="preview-title">{$t('bitcoin.bitcoin')}</div>
						<div class="preview-description">
							{$t('lightning.onChainPayments')}
						</div>
					</div>
				</Card>
			{/if}
		</div>

		<!-- Starknet Card -->
		<div
			class="card-slot starknet-slot"
			class:active={paymentMethod === 'starknet'}
			class:dragging={isDragging}
			style="opacity: {starknetOpacity}; transform: scale({starknetScale})"
		>
			<!-- Dedicated swipe zones for better gesture detection -->
			<div class="swipe-zone swipe-zone-top"></div>
			<div class="swipe-zone swipe-zone-left"></div>
			<div class="swipe-zone swipe-zone-right"></div>

			{#if paymentMethod === 'starknet'}
				<Card>
					<StarknetCard
						{starknetAddress}
						{onPaymentComplete}
						{onError}
						initialAmount={persistentState.amount}
						initialAsset={persistentState.starknetAsset}
						on:amountChange={handleAmountChange}
						on:assetChange={handleAssetChange}
					/>
				</Card>
			{:else}
				<Card>
					<div class="card-preview starknet-preview">
						<div class="preview-icon">⭐</div>
						<div class="preview-title">{$t('starknet.starknet')}</div>
						<div class="preview-description">
							{$t('lightning.starknetPayments')}
						</div>
					</div>
				</Card>
			{/if}
		</div>
	</div>

	<!-- Card indicator dots -->
	<div class="card-indicators">
		<div
			class="indicator"
			class:active={paymentMethod === 'lightning'}
			on:click={() => handleMethodChange('lightning')}
		></div>
		<div
			class="indicator"
			class:active={paymentMethod === 'bitcoin'}
			on:click={() => handleMethodChange('bitcoin')}
		></div>
		<div
			class="indicator"
			class:active={paymentMethod === 'starknet'}
			on:click={() => handleMethodChange('starknet')}
		></div>
	</div>

	<!-- Swipe progress indicator -->
	<div class="swipe-progress">
		<div
			class="progress-track"
			class:lightning-active={paymentMethod === 'lightning'}
			class:bitcoin-active={paymentMethod === 'bitcoin'}
			class:starknet-active={paymentMethod === 'starknet'}
		>
			<div class="progress-thumb" style="transform: translateX({swipeProgress * 33}%)"></div>
		</div>
	</div>
</div>

<style>
	.swipeable-card-container {
		position: relative;
		width: 100%;
		user-select: none;
		overflow: hidden; /* Essential for swipeable interface */
	}

	/* Allow text selection for input elements */
	.swipeable-card-container input,
	.swipeable-card-container textarea,
	.swipeable-card-container select,
	.swipeable-card-container [contenteditable='true'] {
		user-select: text;
		-webkit-user-select: text;
		-moz-user-select: text;
		-ms-user-select: text;
	}

	/* Ensure input containers don't block interaction */
	.swipeable-card-container .amount-input-container,
	.swipeable-card-container .amount-input-wrapper,
	.swipeable-card-container .display-mode-selector,
	.swipeable-card-container .mode-button {
		user-select: text;
		-webkit-user-select: text;
		-moz-user-select: text;
		-ms-user-select: text;
		pointer-events: auto;
		touch-action: manipulation; /* Ensure buttons receive touch events on mobile */
	}

	.swipe-hint {
		position: absolute;
		top: -50px;
		left: 50%;
		transform: translateX(-50%);
		background: linear-gradient(135deg, rgba(246, 148, 19, 0.95), rgba(255, 152, 0, 0.95));
		color: white;
		padding: 0.8rem 1.8rem;
		border-radius: 30px;
		font-size: 0.85rem;
		font-weight: 600;
		z-index: 25;
		animation: pulseEnhanced 3s infinite;
		pointer-events: none;
		white-space: nowrap;
		box-shadow: 0 4px 20px rgba(246, 148, 19, 0.4);
		backdrop-filter: blur(10px);
	}

	.swipe-hint.fade-out {
		animation: fadeOut 0.5s ease-out forwards;
	}

	@keyframes pulseEnhanced {
		0%,
		100% {
			opacity: 0.9;
			transform: translateX(-50%) scale(1);
			box-shadow: 0 4px 20px rgba(246, 148, 19, 0.4);
		}
		50% {
			opacity: 1;
			transform: translateX(-50%) scale(1.08);
			box-shadow: 0 6px 30px rgba(246, 148, 19, 0.6);
		}
	}

	@keyframes fadeOut {
		from {
			opacity: 0.85;
		}
		to {
			opacity: 0;
		}
	}

	.cards-wrapper {
		position: relative;
		width: 300%; /* Restore original width for 3-card layout */
		display: flex;
		outline: none;
		will-change: transform;
		touch-action: pan-y manipulation;
		transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.cards-wrapper.dragging {
		transition: none; /* Disable transition during drag */
	}

	.cards-wrapper:focus {
		outline: 2px solid var(--color-primary, #f69413);
		outline-offset: 4px;
		border-radius: 12px;
	}

	.card-slot {
		width: 33.333%; /* Exactly 1/3 of container width for perfect fit */
		flex-shrink: 0;
		position: relative;
		will-change: transform, opacity;
		touch-action: pan-x pan-y;
		transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
		margin-right: 0; /* No margins needed for perfect fit */
	}

	.card-slot.active {
		z-index: 2;
	}

	.card-slot:not(.active) {
		z-index: 1;
		pointer-events: none;
		opacity: 0.5;
		transform: scale(0.9);
	}

	.card-slot:not(.active) .swipe-zone {
		pointer-events: auto; /* Allow swipe zones to remain interactive */
	}

	.card-slot.dragging {
		transition: none;
		will-change: transform, opacity;
	}

	.card-preview {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem 2rem;
		text-align: center;
		min-height: 200px;
		opacity: 0.7;
	}

	.preview-icon {
		font-size: 3rem;
		margin-bottom: 1rem;
		filter: grayscale(0.3);
	}

	.lightning-preview .preview-icon {
		color: var(--color-primary, #f69413);
	}

	.bitcoin-preview .preview-icon {
		color: #f7931a;
	}

	.starknet-preview .preview-icon {
		background: linear-gradient(135deg, #8b45d7, #1e909b);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.preview-title {
		font-size: 1.25rem;
		font-weight: 600;
		margin-bottom: 0.5rem;
		color: var(--color-text, #333);
	}

	.preview-description {
		font-size: 0.9rem;
		color: var(--color-text-secondary, #666);
		opacity: 0.8;
	}

	.card-indicators {
		display: flex;
		justify-content: center;
		gap: 12px;
		margin-top: 1.5rem;
		margin-bottom: 1rem;
	}

	.indicator {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.3);
		cursor: pointer;
		transition: all 0.3s ease;
		border: 2px solid transparent;
	}

	.indicator.active {
		background: var(--color-primary, #f69413);
		transform: scale(1.2);
		border-color: rgba(246, 148, 19, 0.5);
	}

	.indicator:hover {
		background: rgba(246, 148, 19, 0.7);
		transform: scale(1.1);
	}

	.swipe-progress {
		margin-top: 1rem;
		width: 100%;
		display: flex;
		justify-content: center;
	}

	.progress-track {
		width: 60px;
		height: 4px;
		background: rgba(255, 255, 255, 0.2);
		border-radius: 2px;
		position: relative;
		overflow: hidden;
	}

	.progress-track.lightning-active {
		background: rgba(246, 148, 19, 0.2);
	}

	.progress-track.bitcoin-active {
		background: rgba(247, 147, 26, 0.2);
	}

	.progress-track.starknet-active {
		background: rgba(139, 69, 215, 0.2);
	}

	.progress-thumb {
		position: absolute;
		top: 0;
		left: 50%;
		width: 20px;
		height: 100%;
		background: var(--color-primary, #f69413);
		border-radius: 2px;
		transition: transform 0.2s ease-out;
		transform-origin: center;
	}

	.progress-track.bitcoin-active .progress-thumb {
		background: #f7931a;
	}

	.progress-track.starknet-active .progress-thumb {
		background: linear-gradient(135deg, #8b45d7, #1e909b);
	}

	/* Dedicated swipe zones for improved gesture detection */
	.swipe-zone {
		position: absolute;
		z-index: 10;
		pointer-events: auto;
		touch-action: pan-x;
		background: transparent;
	}

	.swipe-zone-top {
		top: 0;
		left: 0%;
		right: 0%;
		height: 80px;
		pointer-events: none; /* Allow interactions with content below */
	}

	.swipe-zone-left {
		top: 0;
		bottom: 0;
		left: 0;
		width: 40px;
	}

	.swipe-zone-right {
		top: 0;
		bottom: 0;
		right: 0;
		width: 40px;
	}

	/* Show swipe zones on hover for desktop debugging */
	@media (hover: hover) {
		.swipe-zone-left:hover,
		.swipe-zone-right:hover {
			background: rgba(246, 148, 19, 0.1);
			border: 1px dashed rgba(246, 148, 19, 0.3);
		}
	}

	/* Mobile swipe zone visual feedback */
	@media (hover: none) and (pointer: coarse) {
		.swipe-zone-left,
		.swipe-zone-right {
			background: rgba(246, 148, 19, 0.05);
		}

		.swipe-zone-left:active,
		.swipe-zone-right:active {
			background: rgba(246, 148, 19, 0.15);
		}
	}

	/* Enhanced performance optimizations */
	.cards-wrapper,
	.card-slot {
		transform: translateZ(0); /* Force hardware acceleration */
		backface-visibility: hidden;
		-webkit-backface-visibility: hidden;
		-webkit-transform: translateZ(0);
	}

	.cards-wrapper.dragging,
	.cards-wrapper.dragging .card-slot {
		will-change: transform, opacity;
		transform-style: preserve-3d;
		-webkit-transform-style: preserve-3d;
	}

	/* Allow swipe zones to remain interactive during drag */
	.cards-wrapper.dragging .swipe-zone {
		pointer-events: auto;
		z-index: 15;
	}

	/* Mobile optimizations */
	@media (max-width: 640px) {
		.swipe-hint {
			font-size: 0.7rem;
			padding: 0.6rem 1.2rem;
		}

		.card-preview {
			padding: 2rem 1.5rem;
			min-height: 160px;
		}

		.preview-icon {
			font-size: 2.5rem;
		}

		.preview-title {
			font-size: 1.1rem;
		}

		.preview-description {
			font-size: 0.8rem;
		}

		/* Enhanced mobile touch responsiveness */
		.cards-wrapper {
			-webkit-overflow-scrolling: touch;
		}

		.card-slot {
			transform: translate3d(0, 0, 0); /* Force GPU acceleration on mobile */
		}

		/* Much larger swipe zones on mobile for easier access */
		.swipe-zone-top {
			height: 120px; /* Increased from 80px for better touch target */
			left: 0%;
			right: 0%;
			pointer-events: none; /* Allow interactions with content below on mobile */
		}

		.swipe-zone-left,
		.swipe-zone-right {
			width: 60px; /* Increased from 30px for better touch target */
			top: 0;
			bottom: 0;
		}

		.swipe-hint {
			font-size: 0.75rem;
			padding: 0.7rem 1.4rem;
			top: -45px;
		}
	}

	/* High contrast mode */
	@media (prefers-contrast: high) {
		.indicator {
			border: 1px solid var(--color-text, #333);
		}

		.indicator.active {
			border: 2px solid var(--color-text, #333);
		}
	}

	/* Reduced motion */
	@media (prefers-reduced-motion: reduce) {
		.card-slot,
		.indicator,
		.progress-thumb,
		.cards-wrapper {
			transition: none;
		}

		.swipe-hint {
			animation: none;
		}
	}

	/* Touch device optimizations */
	@media (hover: none) and (pointer: coarse) {
		.cards-wrapper {
			padding: 0.5rem 0;
		}

		.card-indicators {
			margin-bottom: 1.5rem;
		}

		.indicator {
			width: 14px;
			height: 14px;
		}
	}

	/* Dark mode support */
	@media (prefers-color-scheme: dark) {
		.card-preview {
			color: var(--color-text-light, #e0e0e0);
		}

		.preview-title {
			color: var(--color-text, #fff);
		}

		.preview-description {
			color: var(--color-text-secondary, #aaa);
		}
	}
</style>
