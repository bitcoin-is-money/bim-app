<!--
  @component
  Lightning Invoice Processor
  
  Processes Lightning invoices by creating Starknet-to-Lightning swaps.
  Users provide a Lightning invoice and pay it using their Starknet assets.
  
  @prop lightningInvoiceData - Parsed Lightning invoice data
  @prop onSwapCreated - Callback when swap is successfully created
  @prop onError - Callback for error handling
  @prop onBack - Callback to go back to previous screen
  
  @author bim
  @version 1.0.0
-->

<script lang="ts">
	import { useStarknetToLightningSwap } from '$lib/composables/useStarknetToLightningSwap';
	import { ConfigValidators } from '$lib/config/validators';
	import type { StarknetToLightningSwap } from '$lib/services/client/lightning/types';
	import { currentUser } from '$lib/stores/auth';
	import { starknetAccountAddress } from '$lib/stores/starknet';
	import {
		formatExpiryTime,
		formatInvoiceAmount,
		getNetworkDisplayName,
		validateInvoiceForPayment
	} from '$lib/utils/lightning-invoice';
	import { logger } from '$lib/utils/logger';
	import type { LightningInvoiceData } from '$lib/utils/qr-parser';
	import { createEventDispatcher, onMount } from 'svelte';

	// Component props
	export let lightningInvoiceData: LightningInvoiceData;
	export let onSwapCreated: (swap: StarknetToLightningSwap) => void = () => {};
	export let onError: (error: string) => void = () => {};
	export let onBack: () => void = () => {};

	// Event dispatcher
	const dispatch = createEventDispatcher();

	// Use the composable instead of direct service
	const { createSwap, updateFormData } = useStarknetToLightningSwap();

	// Component state
	let selectedAsset: 'WBTC' = 'WBTC';
	let isProcessing = false;
	let processingStep = '';
	let validationError = '';
	let addressLoadingTimeout: NodeJS.Timeout | null = null;
	let addressLoadingError = '';
	let addressLoadingStartTime = Date.now();

	/**
	 * Validate form inputs
	 */
	function validateInputs(): boolean {
		validationError = '';

		// Validate BOLT11 invoice if available
		if (lightningInvoiceData.decoded && lightningInvoiceData.type === 'bolt11') {
			const invoiceValidation = validateInvoiceForPayment(lightningInvoiceData.decoded);
			if (!invoiceValidation.valid) {
				validationError = invoiceValidation.error || 'Invalid Lightning invoice';
				return false;
			}
		}

		// Check if user is logged in
		if (!$currentUser) {
			validationError = 'Please log in to process Lightning invoices';
			return false;
		}

		// Check if user's Starknet address is available
		if (!$starknetAccountAddress || !$starknetAccountAddress.trim()) {
			validationError =
				'Your Starknet address is not yet available. Please wait or refresh the page.';
			return false;
		}

		if (!ConfigValidators.isValidStarknetAddress($starknetAccountAddress.trim())) {
			validationError = 'Your Starknet address appears to be invalid. Please refresh the page.';
			return false;
		}

		if (!selectedAsset) {
			validationError = 'Please select a source asset';
			return false;
		}

		return true;
	}

	/**
	 * Process Lightning invoice by creating Starknet-to-Lightning swap
	 */
	async function processLightningInvoice() {
		if (!validateInputs()) {
			return;
		}

		isProcessing = true;
		processingStep = 'Creating swap...';
		validationError = '';

		try {
			logger.info('Processing Lightning invoice', {
				invoiceType: lightningInvoiceData.type,
				sourceAsset: selectedAsset,
				starknetAddress: $starknetAccountAddress.substring(0, 10) + '...'
			});

			processingStep = 'Connecting to Lightning Network...';

			// Update form data with current values
			updateFormData({
				sourceAsset: selectedAsset,
				starknetAddress: $starknetAccountAddress.trim(),
				lightningAddress: lightningInvoiceData.invoice
			});

			// Use the composable to create swap and execute transactions
			await createSwap({
				onSuccess: (swap) => {
					logger.info('Lightning invoice swap created successfully', {
						swapId: swap.swapId,
						sourceAsset: selectedAsset
					});

					// Notify parent component
					onSwapCreated(swap);
					dispatch('swapCreated', { swap });
				},
				onError: (error) => {
					logger.error('Failed to process Lightning invoice', new Error(error));
					throw new Error(error);
				}
			});
		} catch (error) {
			logger.error('Failed to process Lightning invoice', error as Error);

			const errorMessage =
				error instanceof Error
					? error.message
					: 'Failed to process Lightning invoice. Please try again.';

			validationError = errorMessage;
			onError(errorMessage);
			dispatch('error', { error: errorMessage });
		} finally {
			isProcessing = false;
			processingStep = '';
		}
	}

	/**
	 * Handle back button
	 */
	function handleBack() {
		onBack();
		dispatch('back');
	}

	/**
	 * Get invoice display text
	 */
	function getInvoiceDisplayText(invoice: string): string {
		if (invoice.length <= 50) {
			return invoice;
		}
		return invoice.substring(0, 25) + '...' + invoice.substring(invoice.length - 25);
	}

	/**
	 * Get invoice type description
	 */
	function getInvoiceTypeDescription(type: string): string {
		switch (type) {
			case 'bolt11':
				return 'BOLT11 Lightning Invoice';
			case 'lightning_address':
				return 'Lightning Address';
			case 'lnurl':
				return 'LNURL Payment Request';
			default:
				return 'Lightning Payment';
		}
	}

	// Reactive statement to monitor address loading
	$: {
		if ($currentUser && !$starknetAccountAddress && !addressLoadingError) {
			// Start timeout if not already started
			if (!addressLoadingTimeout) {
				addressLoadingTimeout = setTimeout(() => {
					if (!$starknetAccountAddress) {
						addressLoadingError =
							'Failed to load your Starknet address. Please refresh the page or try logging in again.';
						logger.error(
							'Address loading timeout',
							new Error(
								`User: ${$currentUser?.id}, Time elapsed: ${Date.now() - addressLoadingStartTime}ms`
							)
						);
					}
				}, 15000); // 15 second timeout
			}
		} else if ($starknetAccountAddress && addressLoadingTimeout) {
			// Address loaded successfully, clear timeout
			clearTimeout(addressLoadingTimeout);
			addressLoadingTimeout = null;
			addressLoadingError = '';
		}
	}

	onMount(() => {
		logger.info('Lightning Invoice Processor mounted', {
			invoiceType: lightningInvoiceData.type,
			invoiceLength: lightningInvoiceData.invoice.length
		});

		// Cleanup timeout on component destroy
		return () => {
			if (addressLoadingTimeout) {
				clearTimeout(addressLoadingTimeout);
			}
		};
	});
</script>

<div class="lightning-invoice-processor">
	<!-- Header -->
	<div class="processor-header">
		<h3>⚡ Process Lightning Invoice</h3>
		<p class="header-description">Pay this Lightning invoice using your Starknet assets</p>
	</div>

	<!-- Invoice Details -->
	<div class="invoice-details">
		<h4>Invoice Details</h4>
		<div class="invoice-info">
			<div class="detail-row">
				<span class="detail-label">Type:</span>
				<span class="detail-value">{getInvoiceTypeDescription(lightningInvoiceData.type)}</span>
			</div>

			{#if lightningInvoiceData.decoded && lightningInvoiceData.type === 'bolt11'}
				<div class="detail-row">
					<span class="detail-label">Amount:</span>
					<span class="detail-value amount-highlight">
						{formatInvoiceAmount(lightningInvoiceData.decoded.amountSats)}
					</span>
				</div>

				{#if lightningInvoiceData.decoded.description}
					<div class="detail-row">
						<span class="detail-label">Description:</span>
						<span class="detail-value">{lightningInvoiceData.decoded.description}</span>
					</div>
				{/if}

				<div class="detail-row">
					<span class="detail-label">Network:</span>
					<span class="detail-value">
						{getNetworkDisplayName(lightningInvoiceData.decoded.network)}
					</span>
				</div>

				<div class="detail-row">
					<span class="detail-label">Expires:</span>
					<span class="detail-value" class:expired={lightningInvoiceData.decoded.isExpired}>
						{formatExpiryTime(lightningInvoiceData.decoded.expiresAt)}
					</span>
				</div>
			{/if}

			<div class="detail-row">
				<span class="detail-label">Invoice:</span>
				<span class="detail-value invoice-text">
					{getInvoiceDisplayText(lightningInvoiceData.invoice)}
				</span>
			</div>
		</div>
	</div>

	<!-- Payment Configuration -->
	<div class="payment-config">
		<h4>Payment Configuration</h4>

		<!-- User's Starknet Address Display -->
		<div class="config-section">
			<label class="section-label">Your Starknet Address:</label>
			{#if $currentUser && $starknetAccountAddress}
				<div class="address-display">
					<span class="address-text">{$starknetAccountAddress}</span>
					<span class="address-status">✓ Verified</span>
				</div>
				<p class="input-hint">This address will send WBTC to pay the Lightning invoice</p>
			{:else if !$currentUser}
				<div class="address-display error">
					<span class="address-text">Please log in to continue</span>
				</div>
			{:else if addressLoadingError}
				<div class="address-display error">
					<span class="address-text">{addressLoadingError}</span>
					<button
						class="retry-button"
						on:click={() => {
							addressLoadingError = '';
							addressLoadingStartTime = Date.now();
						}}
					>
						Retry
					</button>
				</div>
			{:else}
				<div class="address-display loading">
					<span class="address-text">Loading your address...</span>
					<span class="loading-time">
						({Math.round((Date.now() - addressLoadingStartTime) / 1000)}s)
					</span>
				</div>
			{/if}
		</div>
	</div>

	<!-- Error Display -->
	{#if validationError}
		<div class="error-display">
			<span class="error-icon">⚠️</span>
			<span class="error-text">{validationError}</span>
		</div>
	{/if}

	<!-- Processing Status -->
	{#if isProcessing}
		<div class="processing-status">
			<div class="processing-spinner"></div>
			<span class="processing-text">{processingStep}</span>
		</div>
	{/if}

	<!-- Action Buttons -->
	<div class="action-buttons">
		<button class="back-button" on:click={handleBack} disabled={isProcessing}>Back</button>

		<button
			class="process-button"
			on:click={processLightningInvoice}
			disabled={isProcessing || !$currentUser || !$starknetAccountAddress}
		>
			{#if isProcessing}
				Processing...
			{:else}
				Pay Lightning Invoice
			{/if}
		</button>
	</div>
</div>

<style>
	.lightning-invoice-processor {
		max-width: 600px;
		margin: 0 auto;
		padding: 1.5rem;
		background: var(--color-background, #121413);
		color: var(--color-text, #ffffff);
	}

	.processor-header {
		text-align: center;
		margin-bottom: 2rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid rgba(246, 148, 19, 0.2);
	}

	.processor-header h3 {
		margin: 0 0 0.5rem 0;
		font-size: 1.5rem;
		font-weight: 600;
		color: var(--color-primary, #f69413);
	}

	.header-description {
		margin: 0;
		color: rgba(255, 255, 255, 0.8);
		font-size: 0.95rem;
	}

	.invoice-details,
	.payment-config {
		margin-bottom: 2rem;
	}

	.invoice-details h4,
	.payment-config h4 {
		margin: 0 0 1rem 0;
		font-size: 1.1rem;
		font-weight: 500;
		color: var(--color-text, #ffffff);
	}

	.invoice-info {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(246, 148, 19, 0.2);
		border-radius: 8px;
		padding: 1rem;
	}

	.detail-row {
		display: flex;
		margin-bottom: 0.75rem;
		align-items: flex-start;
	}

	.detail-row:last-child {
		margin-bottom: 0;
	}

	.detail-label {
		font-weight: 500;
		color: rgba(255, 255, 255, 0.7);
		min-width: 80px;
		margin-right: 1rem;
		font-size: 0.9rem;
	}

	.detail-value {
		color: var(--color-text, #ffffff);
		font-size: 0.9rem;
		flex: 1;
	}

	.invoice-text {
		font-family: monospace;
		font-size: 0.85rem;
		word-break: break-all;
		line-height: 1.3;
		background: rgba(0, 0, 0, 0.2);
		padding: 0.5rem;
		border-radius: 4px;
	}

	.amount-highlight {
		color: var(--color-primary, #f69413);
		font-weight: 600;
		font-size: 1rem;
	}

	.detail-value.expired {
		color: #f44336;
		font-weight: 500;
	}

	.config-section {
		margin-bottom: 1.5rem;
	}

	.section-label {
		display: block;
		font-weight: 500;
		margin-bottom: 0.75rem;
		color: var(--color-text, #ffffff);
		font-size: 0.95rem;
	}

	.address-display {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 0.75rem;
		background: rgba(255, 255, 255, 0.05);
		border: 2px solid rgba(74, 222, 128, 0.3);
		border-radius: 6px;
		margin-bottom: 0.5rem;
	}

	.address-display.error {
		border-color: #f44336;
		background: rgba(244, 67, 54, 0.1);
	}

	.address-display.loading {
		border-color: rgba(246, 148, 19, 0.3);
		background: rgba(246, 148, 19, 0.1);
	}

	.address-text {
		color: var(--color-text, #ffffff);
		font-size: 0.9rem;
		font-family: monospace;
		word-break: break-all;
		flex: 1;
		margin-right: 1rem;
	}

	.address-status {
		color: #4ade80;
		font-size: 0.85rem;
		font-weight: 500;
		flex-shrink: 0;
	}

	.address-display.error .address-text {
		color: #f44336;
	}

	.address-display.loading .address-text {
		color: var(--color-primary, #f69413);
	}

	.loading-time {
		color: rgba(255, 255, 255, 0.5);
		font-size: 0.8rem;
		margin-left: 0.5rem;
	}

	.retry-button {
		background: var(--color-primary, #f69413);
		color: white;
		border: none;
		padding: 0.4rem 0.8rem;
		border-radius: 4px;
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	.retry-button:hover {
		background: var(--color-primary-dark, #e8820a);
	}

	.input-hint {
		margin: 0.5rem 0 0 0;
		font-size: 0.8rem;
		color: rgba(255, 255, 255, 0.6);
		line-height: 1.3;
	}

	.error-display {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		background: rgba(244, 67, 54, 0.1);
		border: 1px solid rgba(244, 67, 54, 0.3);
		border-radius: 6px;
		padding: 1rem;
		margin-bottom: 1.5rem;
	}

	.error-icon {
		font-size: 1.25rem;
		flex-shrink: 0;
	}

	.error-text {
		color: #f44336;
		font-size: 0.9rem;
		line-height: 1.4;
	}

	.processing-status {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		background: rgba(246, 148, 19, 0.1);
		border: 1px solid rgba(246, 148, 19, 0.3);
		border-radius: 6px;
		padding: 1.5rem;
		margin-bottom: 1.5rem;
	}

	.processing-spinner {
		width: 20px;
		height: 20px;
		border: 2px solid rgba(246, 148, 19, 0.3);
		border-top: 2px solid var(--color-primary, #f69413);
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		0% {
			transform: rotate(0deg);
		}
		100% {
			transform: rotate(360deg);
		}
	}

	.processing-text {
		color: var(--color-primary, #f69413);
		font-weight: 500;
		font-size: 0.95rem;
	}

	.action-buttons {
		display: flex;
		gap: 1rem;
		justify-content: space-between;
		margin-top: 2rem;
	}

	.back-button,
	.process-button {
		flex: 1;
		padding: 0.875rem 1.5rem;
		border-radius: 6px;
		font-size: 0.95rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
		border: none;
	}

	.back-button {
		background: transparent;
		border: 2px solid rgba(255, 255, 255, 0.3);
		color: var(--color-text, #ffffff);
	}

	.back-button:hover:not(:disabled) {
		border-color: rgba(255, 255, 255, 0.6);
		background: rgba(255, 255, 255, 0.05);
	}

	.process-button {
		background: var(--color-primary, #f69413);
		color: #ffffff;
		border: 2px solid var(--color-primary, #f69413);
	}

	.process-button:hover:not(:disabled) {
		background: #e6850b;
		border-color: #e6850b;
		transform: translateY(-1px);
	}

	.back-button:disabled,
	.process-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
		transform: none;
	}

	/* Mobile responsiveness */
	@media (max-width: 640px) {
		.lightning-invoice-processor {
			padding: 1rem;
		}

		.action-buttons {
			flex-direction: column;
		}

		.back-button,
		.process-button {
			flex: none;
		}
	}

	/* Dark mode support */
	@media (prefers-color-scheme: dark) {
		.invoice-info {
			background: rgba(255, 255, 255, 0.03);
		}

		.address-display {
			background: rgba(255, 255, 255, 0.03);
		}
	}

	/* High contrast mode */
	@media (prefers-contrast: high) {
		.address-display {
			border-width: 3px;
		}
	}

	/* Reduced motion */
	@media (prefers-reduced-motion: reduce) {
		.back-button,
		.process-button,
		.processing-spinner {
			transition: none;
			animation: none;
		}
	}
</style>
