<!--
  @component
  Starknet Payment Card
  
  Dedicated card component for Starknet payments with Starknet-specific
  theming, content, and payment flow. Features purple/teal visual theme
  and direct on-chain messaging.
  
  @prop starknetAddress - User's Starknet wallet address
  @prop onPaymentComplete - Callback when payment completes
  @prop onError - Callback for error handling
  
  @author bim
  @version 1.0.0
-->

<script lang="ts">
	import { STARKNET_CONFIG } from '$lib/constants/blockchain.constants';
	import { createEventDispatcher, onMount, onDestroy } from 'svelte';
	// Import existing components that we'll reuse
	import AmountInput from './AmountInput.svelte';
	import PaymentDisplay from './PaymentDisplay.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import SuccessIndicator from '$lib/components/ui/SuccessIndicator.svelte';

	// Event dispatcher
	const dispatch = createEventDispatcher();

	// Component props
	export let starknetAddress: string;
	export let onPaymentComplete: (data: any) => void = () => {};
	export let onError: (error: string) => void = () => {};

	// State preservation props
	export let initialAmount = 0;
	export let initialAsset = 'STRK';

	// Starknet payment data type
	interface StarknetPaymentData {
		recipientAddress: string; // Changed from 'address' to 'recipientAddress'
		amount: number;
		network: string;
		currency?: string; // Make currency optional since it's not in the standard format
	}

	interface StarknetPayment {
		qrData: string;
		displayData: StarknetPaymentData;
		rawData: StarknetPaymentData;
	}

	// Starknet-specific state
	let amount = initialAmount;
	let asset = initialAsset;
	let currentPayment: StarknetPayment | null = null;
	let errorMessage = '';
	let showSuccessIndicator = false;
	let successMessage = 'sats received';

	// Track previous initial values to detect actual changes from parent
	let prevInitialAmount = initialAmount;
	let prevInitialAsset = initialAsset;

	// Only update local state when initial props actually change from parent
	// (not when user is typing and amount !== initialAmount)
	$: if (initialAmount !== prevInitialAmount) {
		amount = initialAmount;
		prevInitialAmount = initialAmount;
		// Auto-generate when parent updates the initial amount and inputs are valid
		if (starknetAddress?.startsWith('0x') && amount > 0) {
			generateStarknetPayment();
		}
	}
	$: if (initialAsset !== prevInitialAsset) {
		asset = initialAsset;
		prevInitialAsset = initialAsset;
	}

	// Auto-update QR when the Starknet address prop changes and amount is valid
	let __prevStarknetAddress = starknetAddress;
	$: if (starknetAddress !== __prevStarknetAddress) {
		__prevStarknetAddress = starknetAddress;
		if (starknetAddress?.startsWith('0x') && amount > 0) {
			generateStarknetPayment();
		}
	}

	/**
	 * Event handlers
	 */
	function handleAmountChange(newAmount: number) {
		amount = newAmount;
		// Dispatch to parent for state preservation
		dispatch('amountChange', { amount: newAmount });
		// Auto-generate/update QR when amount changes and inputs are valid
		if (starknetAddress?.startsWith('0x') && amount > 0) {
			generateStarknetPayment();
		}
	}

	function handleAssetChange(newAsset: string) {
		asset = newAsset;
		// Dispatch to parent for state preservation
		dispatch('assetChange', { asset: newAsset, method: 'starknet' });
	}

	/**
	 * Generate Starknet payment data
	 */
	function generateStarknetPayment() {
		if (amount <= 0) {
			currentPayment = null;
			return;
		}

		// Create display data and a compact QR payload for faster scanning
		const paymentData = {
			recipientAddress: starknetAddress,
			amount: amount,
			network: STARKNET_CONFIG.NETWORK_NAME
		};

		// Use compact short-key JSON for faster scanning (significantly fewer modules)
		const compactPayload = { r: starknetAddress, a: amount, n: 'S' };
		currentPayment = {
			qrData: JSON.stringify(compactPayload),
			displayData: paymentData,
			rawData: paymentData
		};
	}

	// --- Live on-chain listener (SSE via server-side WebSocket proxy) ---
	let evtSource: EventSource | null = null;

	onMount(() => {
		try {
			if (starknetAddress && starknetAddress.startsWith('0x')) {
				// Only connect while the Starknet card is mounted/visible
				const url = new URL('/api/starknet/subscribe-wbtc', window.location.origin);
				url.searchParams.set('address', starknetAddress);
				evtSource = new EventSource(url.toString());

				// WBTC event: any transfer to our address
				evtSource.addEventListener('wbtc', (ev) => {
					try {
						const payload = JSON.parse((ev as MessageEvent).data as string);
						const amountStr = typeof payload?.amountSats === 'string' ? payload.amountSats : '';
						const pretty = amountStr ? formatIntegerString(amountStr) : '';
						successMessage = pretty ? `${pretty} sats received` : 'sats received';
					} catch (_) {
						successMessage = 'sats received';
					}
					// Show 2s success indicator
					showSuccessIndicator = true;
				});

				// Optional logging
				evtSource.addEventListener('error', (e) => {
					console.warn('Starknet WBTC SSE error:', e);
				});
			}
		} catch (e) {
			console.warn('Failed to initialize Starknet WBTC listener', e);
		}
	});

	onDestroy(() => {
		if (evtSource) {
			evtSource.close();
			evtSource = null;
		}
	});

	function handleSuccessHide() {
		showSuccessIndicator = false;
	}

	function formatIntegerString(s: string): string {
		// Insert thousands separators without converting to Number (avoid precision loss)
		return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
	}
</script>

<div class="starknet-card">
	<!-- Header Section -->
	<div class="card-header">
		<div class="header-content">
			<h2 class="card-title">Starknet</h2>
		</div>
	</div>

	<!-- Amount Input Section -->
	<div class="input-section">
		<AmountInput bind:amount limits={null} displayMode="sats" onAmountChange={handleAmountChange} />
	</div>

	<!-- Generate QR Button -->
	<div class="generator-section" data-swipe-ignore>
		<Button
			variant="primary"
			size="large"
			fullWidth
			on:click={generateStarknetPayment}
			disabled={!starknetAddress || !starknetAddress.startsWith('0x') || !amount || amount <= 0}
		>
			Generate QR Code
		</Button>
	</div>

	<!-- Payment Display Section -->
	{#if currentPayment}
		<div class="payment-section">
			<PaymentDisplay payment={currentPayment} paymentMethod="starknet" />

			<!-- Payment Instructions -->
			<div class="instructions">
				<p class="instruction-text">
					Share this QR code or payment details to receive {amount}
					sats to your Starknet address.
				</p>
			</div>
		</div>
	{/if}

	<!-- Error Display -->
	{#if errorMessage}
		<div class="error-section">
			<p class="error-message">{errorMessage}</p>
		</div>
	{/if}
</div>

<!-- Local Success Indicator for incoming Starknet WBTC transfers -->
<SuccessIndicator
	visible={showSuccessIndicator}
	message={successMessage}
	position="center"
	onHide={handleSuccessHide}
/>

<style>
	.starknet-card {
		padding: 1.5rem;
		border-radius: 16px;
		background: linear-gradient(135deg, rgba(139, 69, 215, 0.05) 0%, rgba(30, 144, 155, 0.05) 100%);
		border: 1px solid rgba(139, 69, 215, 0.2);
		color: var(--color-text, #ffffff);
		min-height: 500px;
		display: flex;
		flex-direction: column;
	}

	/* Header Section */
	.card-header {
		display: flex;
		align-items: center;
		margin-bottom: 1.5rem;
	}

	.header-content {
		flex: 1;
	}

	.card-title {
		margin: 0 0 0.25rem 0;
		font-size: 1.5rem;
		font-weight: 700;
		background: linear-gradient(135deg, #8b45d7, #1e909b);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	/* Input Sections */
	.input-section {
		margin-bottom: 1.5rem;
	}

	/* Generator */
	.generator-section {
		display: flex;
		justify-content: center;
		margin-bottom: 1rem;
	}

	/* Payment Section */
	.payment-section {
		flex: 1;
		display: flex;
		flex-direction: column;
	}

	.instructions {
		margin-top: 1rem;
		padding: 1rem;
		background: rgba(139, 69, 215, 0.1);
		border-radius: 8px;
		border: 1px solid rgba(139, 69, 215, 0.2);
	}

	.instruction-text {
		margin: 0;
		font-size: 0.9rem;
		color: var(--color-text-secondary, #b0b0b0);
		line-height: 1.4;
		text-align: center;
	}

	/* Error Section */
	.error-section {
		margin-top: 1rem;
		padding: 1rem;
		background: rgba(244, 67, 54, 0.1);
		border: 1px solid rgba(244, 67, 54, 0.3);
		border-radius: 8px;
	}

	.error-message {
		margin: 0;
		color: #f44336;
		font-size: 0.9rem;
		text-align: center;
	}

	/* Mobile Responsive */
	@media (max-width: 640px) {
		.starknet-card {
			padding: 1.25rem;
			min-height: 450px;
		}

		.card-header {
			margin-bottom: 1.25rem;
		}

		.card-title {
			font-size: 1.3rem;
		}
	}

	/* Dark mode support */
	@media (prefers-color-scheme: dark) {
		.starknet-card {
			background: linear-gradient(
				135deg,
				rgba(139, 69, 215, 0.08) 0%,
				rgba(30, 144, 155, 0.08) 100%
			);
		}
	}

	/* High contrast mode */
	@media (prefers-contrast: high) {
		.starknet-card {
			border: 2px solid rgba(139, 69, 215, 0.5);
		}

		.instructions {
			border: 1px solid rgba(139, 69, 215, 0.5);
		}
	}

	/* Reduced motion */
	@media (prefers-reduced-motion: reduce) {
		.currency-option {
			transition: none;
		}
	}
</style>
