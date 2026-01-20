<!--
  @component
  Payment Display Component
  
  This component handles the display of payment information including QR codes,
  invoice details, and Bitcoin payment information.
  
  @prop paymentMethod - Type of payment (lightning or bitcoin)
  @prop lightningInvoice - Lightning invoice data (legacy)
  @prop bitcoinSwap - Bitcoin swap data (legacy)
  @prop payment - Generic payment object (preferred)
  @prop destinationAsset - Destination asset for display (e.g., 'WBTC')
  @prop onCopy - Callback when copy to clipboard is triggered
  @prop onRetry - Callback when retry is triggered
  
  @author bim
  @version 2.0.0
-->

<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import LoadingSpinner from '$lib/components/ui/LoadingSpinner.svelte';
	import QRCode from '$lib/components/ui/QRCode.svelte';
	import type { LightningInvoice } from '$lib/services/client/lightning/types';
	import { copyToClipboard } from '$lib/utils/payment-utils';

	// Component props
	export let paymentMethod: 'lightning' | 'bitcoin' | 'starknet';
	export let lightningInvoice: LightningInvoice | null = null;
	export let bitcoinSwap: any | null = null;
	export let payment: any | null = null; // Generic payment object for compatibility
	export let destinationAsset: string = 'WBTC'; // For compatibility with LightningCard
	export let isMonitoring: boolean = false; // Whether payment monitoring is active
	export let onCopy: (text: string) => void = () => {};
	export let onRetry: () => void = () => {};

	// Copy feedback state for Starknet
	let copySuccess = '';
	let copyError = '';
	let copyTimeout: NodeJS.Timeout;

	// Debug payment data when props change
	$: {
		console.log('PaymentDisplay - Props updated:');
		console.log('paymentMethod:', paymentMethod);
		console.log('payment:', payment);
		console.log('lightningInvoice:', lightningInvoice);
		console.log('bitcoinSwap:', bitcoinSwap);
		console.log('destinationAsset:', destinationAsset);
		if (payment) {
			console.log('Payment object keys:', Object.keys(payment));
			console.log('Payment object detailed:', JSON.stringify(payment, null, 2));
		}
	}

	/**
	 * Get QR code data for display
	 */
	// Accept dependencies as parameters so Svelte tracks changes
	function getQRData(
		_paymentMethod: typeof paymentMethod,
		_payment: typeof payment,
		_lightningInvoice: typeof lightningInvoice,
		_bitcoinSwap: typeof bitcoinSwap
	) {
		// Enhanced debugging for QR data
		console.log('🔍 PaymentDisplay getQRData debug:', {
			hasPayment: !!_payment,
			paymentMethod: _paymentMethod,
			payment: _payment
				? {
						hasHyperlink: !!_payment.hyperlink,
						hasInvoice: !!_payment.invoice,
						hyperlink: _payment.hyperlink ? _payment.hyperlink.substring(0, 50) + '...' : null,
						invoice: _payment.invoice ? _payment.invoice.substring(0, 50) + '...' : null
					}
				: null,
			hasLightningInvoice: !!_lightningInvoice,
			lightningInvoice: _lightningInvoice
				? {
						hasHyperlink: !!(_lightningInvoice as any).hyperlink,
						hasInvoice: !!_lightningInvoice.invoice,
						hyperlink: (_lightningInvoice as any).hyperlink
							? (_lightningInvoice as any).hyperlink.substring(0, 50) + '...'
							: null,
						invoice: _lightningInvoice.invoice
							? _lightningInvoice.invoice.substring(0, 50) + '...'
							: null
					}
				: null
		});

		// Handle generic payment object (from LightningCard)
		if (_payment) {
			if (_paymentMethod === 'lightning') {
				const qrData = _payment.hyperlink || _payment.invoice;
				console.log('🔍 PaymentDisplay QR data from payment object:', {
					hasData: !!qrData,
					dataLength: qrData ? qrData.length : 0,
					dataPreview: qrData ? qrData.substring(0, 50) + '...' : null,
					source: _payment.hyperlink ? 'hyperlink' : _payment.invoice ? 'invoice' : 'none'
				});
				return qrData;
			} else if (_paymentMethod === 'bitcoin') {
				return _payment.bip21Uri || _payment.bitcoinAddress;
			} else if (_paymentMethod === 'starknet') {
				return _payment.qrData; // Use the JSON string data for Starknet
			}
		}

		// Handle specific payment objects (legacy)
		if (_paymentMethod === 'lightning' && _lightningInvoice) {
			const qrData = (_lightningInvoice as any).hyperlink || _lightningInvoice.invoice;
			console.log('🔍 PaymentDisplay QR data from lightningInvoice object:', {
				hasData: !!qrData,
				dataLength: qrData ? qrData.length : 0,
				dataPreview: qrData ? qrData.substring(0, 50) + '...' : null,
				source: (_lightningInvoice as any).hyperlink
					? 'hyperlink'
					: _lightningInvoice.invoice
						? 'invoice'
						: 'none'
			});
			return qrData;
		} else if (_paymentMethod === 'bitcoin' && _bitcoinSwap) {
			return _bitcoinSwap.bip21Uri;
		}

		console.log('🔍 PaymentDisplay QR data: no data found');
		return null;
	}

	// Make reactivity explicit by passing dependencies
	$: qrData = getQRData(paymentMethod, payment, lightningInvoice, bitcoinSwap);
	// Debug when qrData changes to ensure updates propagate
	$: if (qrData) {
		console.log('🧭 PaymentDisplay - qrData updated:', {
			length: qrData.length,
			preview: qrData.substring(0, 80) + '...',
			timestamp: new Date().toISOString()
		});
	}

	/**
	 * Copy QR code data to clipboard with enhanced feedback (for Starknet)
	 */
	async function copyQRData() {
		console.log('🚀 Share QR Data button clicked!');
		console.log('📋 Current qrData:', {
			hasQrData: !!qrData,
			qrDataType: typeof qrData,
			qrDataLength: qrData?.length,
			qrDataPreview: qrData ? qrData.substring(0, 100) + '...' : 'null',
			paymentMethod,
			payment,
			timestamp: new Date().toISOString()
		});

		if (!qrData) {
			console.error('❌ No qrData available to copy');
			showCopyError('No QR data available to copy');
			return;
		}

		try {
			console.log('📱 Attempting to copy to clipboard...');
			const success = await copyToClipboard(qrData);
			console.log('📱 Clipboard operation result:', success);

			if (success) {
				console.log('✅ Successfully copied QR data to clipboard');
				showCopySuccess('QR data copied to clipboard!');
				onCopy(qrData); // Maintain backward compatibility
			} else {
				console.error('❌ Clipboard operation returned false');
				showCopyError('Failed to copy QR data - clipboard operation failed');
			}
		} catch (error) {
			console.error('💥 Error copying QR data:', error);
			showCopyError(
				`Failed to copy QR data: ${error instanceof Error ? error.message : 'Unknown error'}`
			);
		}
	}

	/**
	 * Show copy success message
	 */
	function showCopySuccess(message: string) {
		copySuccess = message;
		copyError = '';
		clearTimeout(copyTimeout);
		copyTimeout = setTimeout(() => {
			copySuccess = '';
		}, 3000);
	}

	/**
	 * Show copy error message
	 */
	function showCopyError(message: string) {
		copyError = message;
		copySuccess = '';
		clearTimeout(copyTimeout);
		copyTimeout = setTimeout(() => {
			copyError = '';
		}, 3000);
	}
	// QR size tuning: larger for Starknet receive flow
	const DEFAULT_QR_SIZE = 250;
	const STARKNET_QR_SIZE = 400; // Desktop target; mobile will clamp via QRCode styles
	$: qrSize = paymentMethod === 'starknet' ? STARKNET_QR_SIZE : DEFAULT_QR_SIZE;
</script>

{#if payment || lightningInvoice || bitcoinSwap}
	<div class="payment-display">
		<!-- QR Code Display -->
		<div class="qr-display">
			{#if qrData}
				<!-- QR ready - show immediately when data is available -->
				{#key qrData}
					<QRCode
						data={qrData}
						size={qrSize}
						errorMessage={`Failed to generate ${paymentMethod} payment QR code`}
					/>
				{/key}

				<!-- Payment Monitoring Status -->
				{#if isMonitoring}
					<div class="monitoring-status">
						<LoadingSpinner size="small" />
						<p>Monitoring for payment...</p>
					</div>
				{/if}
			{:else}
				<!-- No QR data available -->
				<div class="qr-error">
					<p>⚠️ Payment data available but no QR code data found</p>
					<Button variant="secondary" size="small" on:click={onRetry}>Retry</Button>
				</div>
			{/if}
		</div>

		<!-- Payment Information -->
		<div class="payment-info">
			{#if paymentMethod === 'lightning' && (payment?.invoice || lightningInvoice?.invoice)}
				<!-- Lightning Invoice -->
				{@const invoice = payment?.invoice || lightningInvoice?.invoice}
				<div class="payment-string">
					<Button variant="secondary" size="small" on:click={() => onCopy(invoice)}>
						Copy Invoice
					</Button>
				</div>
			{:else if paymentMethod === 'bitcoin'}
				{@const bitcoinData = payment || bitcoinSwap}
				{#if bitcoinData?.bitcoinAddress}
					<!-- Bitcoin Address -->
					<div class="payment-string">
						<label for="bitcoin-address">Bitcoin Address:</label>
						<textarea
							id="bitcoin-address"
							readonly
							value={bitcoinData.bitcoinAddress}
							class="payment-text"
						></textarea>
						<Button
							variant="secondary"
							size="small"
							on:click={() => onCopy(bitcoinData.bitcoinAddress)}
						>
							Copy Address
						</Button>
					</div>
				{/if}

				<!-- BIP-21 URI for Wallet Support -->
				{#if bitcoinData?.bip21Uri}
					<div class="payment-string">
						<label for="bip21-uri">BIP-21 URI (for wallet apps):</label>
						<textarea
							id="bip21-uri"
							readonly
							value={bitcoinData.bip21Uri}
							class="payment-text"
						></textarea>
						<Button variant="secondary" size="small" on:click={() => onCopy(bitcoinData.bip21Uri)}>
							Copy URI
						</Button>
					</div>
				{/if}
			{:else if paymentMethod === 'starknet'}
				<!-- Starknet Payment Information -->
				<div class="starknet-payment-info">
					<div class="starknet-instruction">
						<p>Scan the QR code above or share the payment data to receive your Starknet payment</p>
					</div>

					<!-- Debug Info (temporary) -->
					<div class="debug-info">
						<small>Debug: qrData = {qrData ? qrData.substring(0, 50) + '...' : 'null'}</small>
						<small>Payment keys: {payment ? Object.keys(payment).join(', ') : 'none'}</small>
						<small>PaymentMethod: {paymentMethod}</small>
					</div>

					<!-- Share Button - Enhanced and Prominent -->
					<div class="share-section">
						<Button
							variant="primary"
							size="medium"
							on:click={copyQRData}
							disabled={!qrData}
							class="share-button"
						>
							📋 Share QR Data
						</Button>

						<!-- Copy Feedback Messages -->
						{#if copySuccess}
							<div class="copy-feedback success">
								✅ {copySuccess}
							</div>
						{/if}

						{#if copyError}
							<div class="copy-feedback error">
								❌ {copyError}
							</div>
						{/if}
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.payment-display {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		padding: 1rem;
		background: var(--color-surface, white);
		border-radius: 12px;
		border: 1px solid var(--color-border, #e0e0e0);
	}

	.qr-display {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
	}

	.monitoring-status {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem;
		background: var(--color-surface-variant, #f8f9fa);
		border-radius: 8px;
		border: 1px solid var(--color-border-subtle, #e9ecef);
	}

	.monitoring-status p {
		margin: 0;
		font-size: 0.875rem;
		color: var(--color-text-secondary, #666);
		font-weight: 500;
	}

	.qr-error {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		width: 250px;
		height: 250px;
		background: var(--color-surface-variant, #f5f5f5);
		border-radius: 8px;
		text-align: center;
		color: var(--color-error, #dc3545);
	}

	.payment-info {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.payment-string {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.payment-string label {
		font-weight: 500;
		font-size: 0.875rem;
		color: var(--color-text-secondary, #666);
	}

	.payment-text {
		width: 100%;
		min-height: 4rem;
		padding: 0.75rem;
		border: 1px solid var(--color-border, #ddd);
		border-radius: 6px;
		background: var(--color-surface-variant, #f9f9f9);
		font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
		font-size: 0.75rem;
		line-height: 1.4;
		resize: vertical;
		word-break: break-all;
	}

	.payment-text:focus {
		outline: none;
		border-color: var(--color-primary, #0070f3);
	}

	/* Starknet-specific styling */
	.starknet-payment-info {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1rem;
		background: linear-gradient(135deg, rgba(139, 69, 215, 0.05) 0%, rgba(30, 144, 155, 0.05) 100%);
		border: 1px solid rgba(139, 69, 215, 0.2);
		border-radius: 8px;
	}

	.starknet-instruction {
		text-align: center;
	}

	.starknet-instruction p {
		margin: 0;
		font-size: 0.875rem;
		color: var(--color-text-secondary, #666);
		line-height: 1.4;
	}

	.debug-info {
		background: rgba(255, 255, 0, 0.1);
		border: 1px solid rgba(255, 255, 0, 0.3);
		border-radius: 4px;
		padding: 0.5rem;
		margin-bottom: 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.debug-info small {
		font-family: monospace;
		font-size: 0.7rem;
		color: var(--color-text, #333);
		word-break: break-all;
	}

	.share-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
	}

	.share-section :global(.share-button) {
		min-width: 160px;
		font-weight: 600;
	}

	.copy-feedback {
		padding: 0.5rem 1rem;
		border-radius: 6px;
		font-size: 0.875rem;
		font-weight: 500;
		text-align: center;
		animation: fadeInOut 3s ease-in-out;
	}

	.copy-feedback.success {
		background: rgba(34, 197, 94, 0.1);
		color: #22c55e;
		border: 1px solid rgba(34, 197, 94, 0.3);
	}

	.copy-feedback.error {
		background: rgba(239, 68, 68, 0.1);
		color: #ef4444;
		border: 1px solid rgba(239, 68, 68, 0.3);
	}

	@keyframes fadeInOut {
		0% {
			opacity: 0;
			transform: translateY(-10px);
		}
		15% {
			opacity: 1;
			transform: translateY(0);
		}
		85% {
			opacity: 1;
			transform: translateY(0);
		}
		100% {
			opacity: 0;
			transform: translateY(-10px);
		}
	}

	@media (max-width: 640px) {
		.payment-display {
			padding: 0.75rem;
			gap: 1rem;
		}

		.qr-display {
			gap: 0.75rem;
		}

		.payment-text {
			min-height: 3rem;
			font-size: 0.7rem;
		}

		.starknet-payment-info {
			padding: 0.75rem;
		}

		.starknet-instruction p {
			font-size: 0.8rem;
		}

		.share-section :global(.share-button) {
			min-width: 140px;
			font-size: 0.9rem;
		}
	}
</style>
