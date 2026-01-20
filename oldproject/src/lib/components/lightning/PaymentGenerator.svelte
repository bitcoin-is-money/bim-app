<!--
  @component
  Payment Generator Component
  
  This component handles the generation of Lightning invoices and Bitcoin swaps,
  including validation, loading states, and error handling.
  
  @prop paymentMethod - Type of payment to generate (lightning or bitcoin)
  @prop amount - Payment amount in satoshis
  @prop starknetAddress - Destination Starknet address
  @prop destinationAsset - Target asset for the swap
  @prop disabled - Whether generation is disabled
  @prop onPaymentGenerated - Callback when payment is successfully generated
  @prop onError - Callback when generation fails
  
  @author bim
  @version 1.0.0
-->

<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import LoadingSpinner from '$lib/components/ui/LoadingSpinner.svelte';
	import type { LightningInvoice } from '$lib/services/client/lightning.client.service';
	import { getLightningService } from '$lib/services/client/lightning.client.service';
	import { createEventDispatcher } from 'svelte';

	const dispatch = createEventDispatcher();

	// Component props
	export let paymentMethod: 'lightning' | 'bitcoin' = 'lightning';
	export let amount = 0;
	export let starknetAddress = '';
	export let destinationAsset = 'WBTC';
	export let disabled = false;
	export let onPaymentGenerated: (
		invoice: LightningInvoice | any,
		type: 'lightning' | 'bitcoin'
	) => void = () => {};
	export let onError: (error: string) => void = () => {};

	// Exported state for binding
	export let currentPayment: any = null;

	// Component state
	let isGenerating = false;
	let loadingMessage = '';
	let hasAttemptedGeneration = false;

	/**
	 * Generate payment (Lightning invoice or Bitcoin swap)
	 */
	async function generatePayment() {
		hasAttemptedGeneration = true;

		if (!amount || amount <= 0) {
			const errorMsg = 'Please enter a valid amount';
			dispatch('error', { error: errorMsg });
			onError(errorMsg);
			return;
		}

		if (!starknetAddress) {
			const errorMsg = 'Starknet address is required';
			dispatch('error', { error: errorMsg });
			onError(errorMsg);
			return;
		}

		isGenerating = true;
		loadingMessage =
			paymentMethod === 'lightning' ? 'Creating Lightning invoice...' : 'Creating Bitcoin swap...';

		try {
			if (paymentMethod === 'lightning') {
				await generateLightningPayment();
			} else {
				await generateBitcoinPayment();
			}
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : 'Unknown error occurred';
			console.error('Payment generation error:', error);

			const fullErrorMsg = `Failed to generate ${paymentMethod} payment: ${errorMsg}`;
			console.log('PaymentGenerator - Dispatching error event:', fullErrorMsg);
			dispatch('error', { error: fullErrorMsg });

			// Also call the callback for backward compatibility
			onError(fullErrorMsg);
		} finally {
			isGenerating = false;
			loadingMessage = '';
		}
	}

	/**
	 * Generate Lightning invoice
	 */
	async function generateLightningPayment() {
		loadingMessage = 'Generating Lightning invoice...';

		console.log('PaymentGenerator - About to create Lightning invoice with params:', {
			amount,
			starknetAddress,
			destinationAsset
		});

		const invoice = await getLightningService().createInvoice({
			amount,
			starknetAddress,
			destinationAsset
		});

		if (!invoice) {
			throw new Error('Failed to create Lightning invoice');
		}

		console.log('PaymentGenerator - Lightning invoice created:', {
			swapId: invoice.swapId,
			amount: invoice.amount,
			destinationAsset: invoice.destinationAsset
		});
		console.log('PaymentGenerator - Full invoice object:', invoice);
		console.log('PaymentGenerator - Invoice object keys:', Object.keys(invoice));
		console.log('PaymentGenerator - Invoice structure:', JSON.stringify(invoice, null, 2));

		// Set the currentPayment for binding
		currentPayment = invoice;
		console.log('PaymentGenerator - Set currentPayment to:', currentPayment);

		console.log('PaymentGenerator - Dispatching paymentGenerated event with invoice:', invoice);
		dispatch('paymentGenerated', { payment: invoice });

		// Also call the callback for backward compatibility
		onPaymentGenerated(invoice, 'lightning');
	}

	/**
	 * Generate Bitcoin swap
	 */
	async function generateBitcoinPayment() {
		loadingMessage = 'Creating Bitcoin swap...';

		const response = await fetch('/api/bitcoin/create-swap', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				amount,
				starknetAddress,
				destinationAsset,
				expirationMinutes: 60 // Bitcoin swaps typically have longer expiration
			})
		});

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
			throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
		}

		const data = await response.json();

		if (!data.success) {
			throw new Error(data.message || 'Failed to create Bitcoin swap');
		}

		const bitcoinSwap = data.data;
		console.log('PaymentGenerator - Bitcoin swap created:', {
			swapId: bitcoinSwap.swapId,
			amount: bitcoinSwap.amount,
			bitcoinAddress: bitcoinSwap.bitcoinAddress
		});
		console.log('PaymentGenerator - Full bitcoin swap object:', bitcoinSwap);
		console.log('PaymentGenerator - Bitcoin swap structure:', JSON.stringify(bitcoinSwap, null, 2));

		// Set the currentPayment for binding
		currentPayment = bitcoinSwap;
		console.log('PaymentGenerator - Set currentPayment to:', currentPayment);

		console.log(
			'PaymentGenerator - Dispatching paymentGenerated event with bitcoin swap:',
			bitcoinSwap
		);
		dispatch('paymentGenerated', { payment: bitcoinSwap });

		// Also call the callback for backward compatibility
		onPaymentGenerated(bitcoinSwap, 'bitcoin');
	}

	/**
	 * Reset payment state
	 */
	export function resetPayment() {
		console.log('PaymentGenerator - Resetting payment state');
		currentPayment = null;
		isGenerating = false;
		loadingMessage = '';
		hasAttemptedGeneration = false;

		console.log('PaymentGenerator - Dispatching reset event');
		dispatch('reset');
	}

	/**
	 * Validate inputs before generation
	 */
	function validateInputs(): string | null {
		if (!amount || amount <= 0) {
			return 'Please enter a valid amount';
		}

		if (!starknetAddress) {
			return 'Starknet address is required';
		}

		if (!starknetAddress.startsWith('0x')) {
			return 'Invalid Starknet address format';
		}

		return null;
	}

	/**
	 * Get button text based on current state
	 */
	function getButtonText(): string {
		if (isGenerating) {
			return paymentMethod === 'lightning' ? 'Creating Invoice...' : 'Creating Swap...';
		}

		return paymentMethod === 'lightning' ? 'Generate Lightning Invoice' : 'Create Bitcoin Swap';
	}

	// Check if generation should be disabled (separate from error display logic)
	$: generationDisabled =
		disabled ||
		isGenerating ||
		!amount ||
		amount <= 0 ||
		!starknetAddress ||
		!starknetAddress.startsWith('0x');

	// Reset attempt flag when amount becomes valid
	$: if (amount > 0 && hasAttemptedGeneration) {
		hasAttemptedGeneration = false;
	}
</script>

<div class="payment-generator">
	<div class="generate-section" data-swipe-ignore>
		<Button
			variant="primary"
			size="large"
			disabled={generationDisabled}
			on:click={generatePayment}
			fullWidth
		>
			{#if isGenerating}
				<LoadingSpinner size="small" />
				{getButtonText()}
			{:else}
				{getButtonText()}
			{/if}
		</Button>

		{#if loadingMessage && !isGenerating}
			<div class="loading-message">
				<LoadingSpinner size="small" />
				{loadingMessage}
			</div>
		{/if}

		{#if hasAttemptedGeneration && validateInputs() && !isGenerating}
			<div class="validation-error">
				{validateInputs()}
			</div>
		{/if}
	</div>
</div>

<style>
	.payment-generator {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.generate-section {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.loading-message {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		justify-content: center;
		font-size: 0.875rem;
		color: var(--color-text-secondary, #666);
	}

	.validation-error {
		text-align: center;
		color: var(--color-error, #dc3545);
		font-size: 0.875rem;
		font-weight: 500;
	}

	@media (max-width: 640px) {
		.payment-generator {
			gap: 1rem;
		}
	}
</style>
