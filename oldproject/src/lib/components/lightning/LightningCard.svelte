<!--
  @component
  Lightning Network Payment Card
  
  Dedicated card component for Lightning Network payments with Lightning-specific
  theming, content, and payment flow. Features orange/lightning visual theme
  and instant payment messaging.
  
  @prop starknetAddress - User's Starknet wallet address
  @prop onPaymentComplete - Callback when payment completes
  @prop onError - Callback for error handling
  
  @author bim
  @version 1.0.0
-->

<script lang="ts">
	import type { SwapStatus, LightningInvoice } from '$lib/services/client/lightning.client.service';
	import { onDestroy, onMount, createEventDispatcher } from 'svelte';

	// Event dispatcher
	const dispatch = createEventDispatcher();
	// Import existing components that we'll reuse
	import AmountInput from './AmountInput.svelte';
	import ClaimingComponent from './ClaimingComponent.svelte';
	import PaymentDisplay from './PaymentDisplay.svelte';
	import PaymentGenerator from './PaymentGenerator.svelte';
	import PaymentMonitor from './PaymentMonitor.svelte';
	import { PricingOrchestrator } from '$lib/services/client/pricing/pricing-orchestrator';
	import type { PriceData } from '$lib/services/client/pricing/types';

	// Component props
	export let starknetAddress: string;
	export let onPaymentComplete: (status: SwapStatus) => void = () => {};
	export let onError: (error: string) => void = () => {};

	// State preservation props
	export let initialAmount = 0;
	export let initialDestinationAsset = 'WBTC';

	// Lightning-specific state
	let destinationAsset = initialDestinationAsset;
	let amount = initialAmount;
	let displayMode: 'sats' | 'usd' = 'sats';
	let currentPayment: any = null;
	let lightningInvoice: LightningInvoice | null = null;
	let swapStatus: SwapStatus | null = null;
	let errorMessage = '';
	let isMonitoring = false;
	let pricingService: PricingOrchestrator | null = null;
	let btcPrice: PriceData | null = null;

	// Copy functionality state
	let copySuccess = '';
	let copyTimeout: NodeJS.Timeout | null = null;

	// Success indicator state
	let showSuccessIndicator = false;

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

	// Component references
	let paymentMonitor: PaymentMonitor;

	// Debug reactive statement for claiming UI condition
	$: {
		console.log('🔍 LightningCard reactive claiming check:', {
			swapStatus: swapStatus?.status,
			shouldShowClaiming: swapStatus?.status === 'paid',
			hasLightningInvoice: !!lightningInvoice,
			showSuccessIndicator,
			lightningInvoice: lightningInvoice
				? {
						swapId: lightningInvoice.swapId,
						hasInvoice: !!lightningInvoice.invoice,
						amount: lightningInvoice.amount,
						destinationAsset: lightningInvoice.destinationAsset
					}
				: null,
			timestamp: new Date().toISOString()
		});
	}

	/**
	 * Component lifecycle cleanup
	 */
	onDestroy(() => {
		console.log('🔥 LightningCard: Component destroying');
		if (paymentMonitor) {
			paymentMonitor.stopMonitoring();
		}
	});

	onMount(async () => {
		console.log('🎬 LightningCard: Component mounted');
		try {
			pricingService = PricingOrchestrator.getInstance();
			btcPrice = await pricingService.getPrice('WBTC');
		} catch (e) {
			console.error('Failed to load BTC price for conversions', e);
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

	function handleDisplayModeChange(mode: 'sats' | 'usd') {
		displayMode = mode;
	}

	function handleAssetChange(_asset: string) {
		// destinationAsset = asset;
		// Dispatch to parent for state preservation
		// dispatch('assetChange', { asset, method: 'lightning' });
	}

	function handlePaymentGenerated(event: CustomEvent<{ payment: any }>) {
		console.log('LightningCard - handlePaymentGenerated called');
		console.log('Event detail:', event.detail);
		console.log('Payment data received:', event.detail.payment);
		console.log('Payment data structure:', JSON.stringify(event.detail.payment, null, 2));

		currentPayment = event.detail.payment;
		console.log('currentPayment set to:', currentPayment);

		// Create proper LightningInvoice object for claiming
		if (currentPayment) {
			lightningInvoice = {
				swapId: currentPayment.swapId,
				invoice: currentPayment.invoice,
				hyperlink: currentPayment.hyperlink,
				amount: amount, // Use the amount from component state
				destinationAsset: destinationAsset,
				starknetAddress: starknetAddress,
				expiresAt: currentPayment.expiresAt,
				createdAt: new Date().toISOString()
			};
			console.log('lightningInvoice created:', lightningInvoice);
		}

		errorMessage = '';
	}

	function handlePaymentError(event: CustomEvent<{ error: string }>) {
		errorMessage = event.detail.error;
		onError(event.detail.error);
	}

	function handleStatusUpdate(event: CustomEvent<{ status: SwapStatus }>) {
		console.log('🔄 LightningCard.handleStatusUpdate:', {
			previousStatus: swapStatus?.status,
			newStatus: event.detail.status?.status,
			newProgress: event.detail.status?.progress,
			fullStatus: event.detail.status,
			timestamp: new Date().toISOString()
		});

		swapStatus = event.detail.status;

		console.log('🔄 LightningCard status updated:', {
			swapStatus,
			shouldShowClaiming: swapStatus?.status === 'paid',
			hasLightningInvoice: !!lightningInvoice,
			lightningInvoiceSwapId: lightningInvoice?.swapId
		});
	}

	function handlePaymentComplete(event: CustomEvent<{ status: SwapStatus }>) {
		onPaymentComplete(event.detail.status);
	}

	function handleClaimComplete(success: boolean, _message: string) {
		console.log('🎯 LightningCard.handleClaimComplete called:', {
			success,
			message: _message,
			hasSwapStatus: !!swapStatus,
			swapStatus: swapStatus?.status,
			timestamp: new Date().toISOString()
		});

		if (success && swapStatus) {
			console.log('✅ LightningCard: Setting showSuccessIndicator = true');
			// Show success indicator
			showSuccessIndicator = true;

			console.log('🔄 LightningCard: showSuccessIndicator is now:', showSuccessIndicator);

			// Dispatch success event to parent components
			console.log('📡 LightningCard: Dispatching lightningClaimSuccess event');
			dispatch('lightningClaimSuccess', {
				message: _message,
				swapStatus: swapStatus,
				timestamp: new Date().toISOString()
			});

			// Update swap status to completed
			swapStatus = {
				...swapStatus,
				status: 'completed',
				lastUpdated: new Date().toISOString()
			};
			onPaymentComplete(swapStatus);
		} else {
			console.log('❌ LightningCard: Not showing success indicator:', {
				success,
				hasSwapStatus: !!swapStatus
			});
		}
	}

	/**
	 * Handle monitoring state changes
	 */
	function handleMonitoringChange(event: CustomEvent<{ monitoring: boolean }>) {
		isMonitoring = event.detail.monitoring;
	}

	/**
	 * Reset payment state
	 */
	function reset() {
		currentPayment = null;
		lightningInvoice = null;
		swapStatus = null;
		errorMessage = '';
		isMonitoring = false;

		if (paymentMonitor) {
			paymentMonitor.stopMonitoring();
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

	/**
	 * Handle success indicator hide
	 */
	function handleSuccessIndicatorHide() {
		console.log('🎭 LightningCard: handleSuccessIndicatorHide called');
		showSuccessIndicator = false;
		console.log('🔄 LightningCard: showSuccessIndicator reset to:', showSuccessIndicator);
	}
</script>

<div class="lightning-card">
	<!-- Amount Input -->
	<div class="amount-section">
		<AmountInput
			bind:amount
			limits={null}
			bind:displayMode
			price={btcPrice}
			allowedModes={['sats', 'usd']}
			disabled={false}
			onAmountChange={handleAmountChange}
			onDisplayModeChange={handleDisplayModeChange}
		/>
	</div>

	<!-- Payment Generator -->
	<div class="generator-section">
		<PaymentGenerator
			{amount}
			paymentMethod="lightning"
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
			{console.log('LightningCard - Rendering PaymentDisplay with payment:', currentPayment)}
			<PaymentDisplay
				payment={currentPayment}
				paymentMethod="lightning"
				{destinationAsset}
				{isMonitoring}
				onCopy={handleCopy}
			/>

			<!-- Copy Success Message -->
			{#if copySuccess}
				<div class="copy-success">
					✅ {copySuccess}
				</div>
			{/if}

			<!-- Payment Monitor -->
			<PaymentMonitor
				bind:this={paymentMonitor}
				swapId={currentPayment?.swapId || ''}
				paymentMethod="lightning"
				qrCodeReady={!!currentPayment?.invoice || !!currentPayment?.hyperlink}
				on:statusUpdate={handleStatusUpdate}
				on:complete={handlePaymentComplete}
				on:error={handlePaymentError}
				on:monitoringChange={handleMonitoringChange}
			/>

			<!-- Claiming Component -->
			{#if swapStatus?.status === 'paid'}
				{console.log('🎯 LightningCard: Showing ClaimingComponent', {
					lightningInvoice,
					swapStatus,
					hasLightningInvoice: !!lightningInvoice,
					hasSwapId: !!lightningInvoice?.swapId
				})}
				<ClaimingComponent
					{lightningInvoice}
					{swapStatus}
					onClaimComplete={handleClaimComplete}
					onClaimError={(error) =>
						handlePaymentError({ detail: { error } } as CustomEvent<{
							error: string;
						}>)}
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

<!-- Debug: Track if showSuccessIndicator gets set -->
{#if showSuccessIndicator}
	{console.log(
		'🚨 LightningCard: showSuccessIndicator is true, but using page-level indicator now'
	)}
{/if}

<style>
	.lightning-card {
		padding: 1.5rem;
		background: linear-gradient(135deg, rgba(246, 148, 19, 0.05) 0%, rgba(255, 193, 7, 0.03) 100%);
		border: 1px solid rgba(246, 148, 19, 0.1);
		border-radius: 16px;
		position: relative;
		overflow: hidden;
		transform: translateZ(0);
		backface-visibility: hidden;
		-webkit-tap-highlight-color: transparent;
		touch-action: manipulation;
	}

	.lightning-card::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 4px;
		background: linear-gradient(90deg, var(--color-primary, #f69413) 0%, #ffc107 100%);
		border-radius: 16px 16px 0 0;
	}

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
		.lightning-card {
			padding: 1.25rem;
		}
	}

	/* Dark mode support */
	@media (prefers-color-scheme: dark) {
		.lightning-card {
			background: linear-gradient(
				135deg,
				rgba(246, 148, 19, 0.08) 0%,
				rgba(255, 193, 7, 0.05) 100%
			);
			border-color: rgba(246, 148, 19, 0.2);
		}
	}

	/* Reduced motion */
	@media (prefers-reduced-motion: reduce) {
		/* No specific reduced motion styles needed */
	}

	/* High contrast mode */
	@media (prefers-contrast: high) {
		.lightning-card {
			border-color: var(--color-primary, #f69413);
		}
	}
</style>
