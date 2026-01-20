<!--
  @component
  QR Scan Modal Component
  
  Modal dialog that contains the QR scanner and handles the scanning workflow.
  Parses scanned data and provides appropriate action buttons based on the type.
  
  @prop isOpen - Whether the modal is open
  @prop onClose - Callback when modal is closed
  @prop onLightningInvoice - Callback when Lightning invoice is scanned
  @prop onBitcoinAddress - Callback when Bitcoin address is scanned
  @prop onStarknetInvoice - Callback when Starknet invoice is scanned
  @prop onError - Callback when error occurs
  
  @author bim
  @version 1.0.0
-->

<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import QRCodeScanner from '$lib/components/ui/QRCodeScanner.svelte';
	import type { StarknetReceiveData } from '$lib/services/client/lightning/types';
	import { t } from 'svelte-i18n';

	import {
		getQRTypeDescription,
		getQRTypeIcon,
		parseQRData,
		QRDataType,
		type BitcoinAddressData,
		type LightningInvoiceData,
		type ParsedQRData
	} from '$lib/utils/qr-parser';

	// Component props
	export let isOpen = false;
	export let onClose: () => void = () => {};
	export let onLightningInvoice: (data: LightningInvoiceData) => void = () => {};
	export let onBitcoinAddress: (data: BitcoinAddressData) => void = () => {};
	export let onStarknetInvoice: (data: StarknetReceiveData) => void = () => {};
	export let onError: (error: string) => void = () => {};

	// Component state
	let scanResult: ParsedQRData | null = null;
	let isScanning = true;
	let scanError = '';
	let hasShownError = false;
	let hasScannedSuccessfully = false; // Add flag to prevent multiple scans
	let lastScannedData = ''; // Track last scanned data to prevent duplicates
	let shouldIgnoreScans = false; // More aggressive scan prevention
	let hasProcessedResult = false; // Auto-process once on valid parse

	// Debug scanner state
	$: console.log('🔍 QRScanModal scanner state:', {
		isOpen,
		isScanning,
		hasScannedSuccessfully,
		shouldIgnoreScans,
		isActive: isOpen && isScanning,
		timestamp: new Date().toISOString()
	});

	// Swipe detection
	let touchStartX = 0;
	let touchStartY = 0;

	// Event dispatcher (unused for now)
	// const dispatch = createEventDispatcher();

	/**
	 * Handle QR code scan result
	 */
	async function handleScan(rawData: string) {
		// Aggressive scan prevention - completely ignore if we should
		if (shouldIgnoreScans) {
			console.log('🚫 Aggressively ignoring scan - shouldIgnoreScans is true:', {
				timestamp: new Date().toISOString()
			});
			return;
		}

		// Prevent multiple scans of the same QR code
		if (hasScannedSuccessfully) {
			console.log('🚫 Preventing duplicate scan - already scanned successfully:', {
				hasScannedSuccessfully,
				timestamp: new Date().toISOString()
			});
			return;
		}

		// Also prevent processing the same data multiple times
		if (rawData === lastScannedData) {
			console.log('🚫 Preventing duplicate scan - same data:', {
				lastScannedData: lastScannedData.substring(0, 50),
				currentData: rawData.substring(0, 50),
				timestamp: new Date().toISOString()
			});
			return;
		}

		console.log('📱 QRScanModal handleScan() called:', {
			rawDataLength: rawData?.length,
			rawDataType: typeof rawData,
			rawDataPreview: rawData?.substring(0, 100),
			timestamp: new Date().toISOString()
		});

		// Track this scan attempt
		lastScannedData = rawData;

		try {
			// Additional debugging for JSON-like data
			if (rawData?.trim().startsWith('{') && rawData?.trim().endsWith('}')) {
				console.log('🔍 Detected JSON-like data, attempting to parse manually:', {
					rawData,
					trimmedData: rawData.trim(),
					startsWithBrace: rawData.trim().startsWith('{'),
					endsWithBrace: rawData.trim().endsWith('}'),
					length: rawData.length
				});

				try {
					const manualParse = JSON.parse(rawData);
					console.log('✅ Manual JSON parse successful:', {
						parsed: manualParse,
						keys: Object.keys(manualParse || {}),
						keyTypes: Object.keys(manualParse || {}).map(
							(key) => `${key}: ${typeof manualParse?.[key]}`
						)
					});
				} catch (manualParseError) {
					console.error('❌ Manual JSON parse failed:', manualParseError);
				}
			}

			const result = await parseQRData(rawData);
			console.log('📊 parseQRData() result:', {
				resultType: result.type,
				isValid: result.isValid,
				error: result.error,
				parsedDataAvailable: !!result.parsedData,
				timestamp: new Date().toISOString()
			});

			scanResult = result;

			if (!result.isValid) {
				// Enhanced error message with debugging information
				const detailedError = `${result.error || $t('scanner.invalidQrCodeFormat')}`;

				// Add specific hints for common issues
				let errorHint = '';
				if (rawData?.startsWith('{') && rawData?.endsWith('}')) {
					errorHint =
						' (This looks like JSON data - check if it matches the expected Starknet format)';
				} else if (rawData?.toLowerCase().includes('starknet')) {
					errorHint = ' (Contains "Starknet" but structure may be incorrect)';
				} else if (rawData?.startsWith('0x')) {
					errorHint = ' (Looks like an address without amount/network info)';
				}

				scanError = detailedError + errorHint;
				hasShownError = true;

				console.warn('❌ QR code validation failed:', {
					rawData: rawData?.substring(0, 200),
					error: result.error,
					errorHint,
					fullError: scanError,
					timestamp: new Date().toISOString()
				});

				// Keep scanning active to show error overlay
				isScanning = true;
			} else {
				// Only switch to results view for valid QR codes
				isScanning = false;
				hasScannedSuccessfully = true; // Mark as successfully scanned
				shouldIgnoreScans = true; // Aggressively prevent any more scans

				console.log('✅ QR code successfully validated, scanner stopped:', {
					type: result.type,
					parsedData: result.parsedData,
					timestamp: new Date().toISOString()
				});

				// Automatically process the scanned data without requiring a click
				if (!hasProcessedResult) {
					hasProcessedResult = true;
					// Defer slightly to ensure state is set before processing
					setTimeout(() => {
						try {
							processScannedData();
						} catch (e) {
							console.error('Auto-processing failed:', e);
						}
					}, 0);
				}
			}
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : $t('scanner.failedToParseQrCode');

			// Enhanced error reporting with raw data info
			const detailedError = `${errorMsg} (Raw data: ${rawData?.length || 0} chars, starts with: "${rawData?.substring(0, 20)}...")`;
			scanError = detailedError;
			hasShownError = true;

			console.error('❌ QR parsing exception:', {
				error: error instanceof Error ? error.message : error,
				errorStack: error instanceof Error ? error.stack : undefined,
				rawData: rawData?.substring(0, 200),
				detailedError,
				timestamp: new Date().toISOString()
			});

			// Set a generic unknown result for display
			scanResult = {
				type: QRDataType.UNKNOWN,
				rawData,
				parsedData: null,
				isValid: false,
				error: detailedError
			};
			// Keep scanning active to show error overlay
			isScanning = true;
		}
	}

	/**
	 * Handle scanner error
	 */
	function handleScannerError(error: string) {
		console.error('Scanner error:', error);
		scanError = error;
		// Don't call onError to keep the scanner active and show error overlay
		// onError(error);
	}

	/**
	 * Process the scanned data based on type
	 */
	function processScannedData() {
		if (!scanResult || !scanResult.isValid) return;

		switch (scanResult.type) {
			case QRDataType.LIGHTNING_INVOICE:
				onLightningInvoice(scanResult.parsedData as LightningInvoiceData);
				break;
			case QRDataType.BITCOIN_ADDRESS:
				onBitcoinAddress(scanResult.parsedData as BitcoinAddressData);
				break;
			case QRDataType.STARKNET_INVOICE:
				onStarknetInvoice(scanResult.parsedData as StarknetReceiveData);
				break;
			default:
				onError($t('scanner.unsupportedQrCodeType'));
				return;
		}

		// Close modal after processing
		handleClose();
	}

	/**
	 * Restart scanning after error
	 */
	function restartScan() {
		scanResult = null;
		isScanning = true;
		scanError = '';
		hasShownError = false;
		hasScannedSuccessfully = false; // Reset success flag
		lastScannedData = ''; // Clear last scanned data
		shouldIgnoreScans = false; // Reset aggressive prevention
		hasProcessedResult = false; // Allow future auto-processing
	}

	/**
	 * Handle modal close
	 */
	function handleClose() {
		try {
			// Stop scanning
			isScanning = false;
			shouldIgnoreScans = false; // Reset aggressive prevention
		} catch (error) {
			console.error('Error stopping scanner:', error);
		}

		// Reset state
		scanResult = null;
		scanError = '';
		hasShownError = false;
		hasScannedSuccessfully = false; // Reset success flag
		lastScannedData = ''; // Clear last scanned data
		shouldIgnoreScans = false; // Reset aggressive prevention
		hasProcessedResult = false; // Reset auto-processing flag
		onClose();
	}

	/**
	 * Handle escape key press
	 */
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === $t('keys.escape') && isOpen) {
			handleClose();
		}
	}

	/**
	 * Handle modal backdrop click
	 */
	function handleBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			handleClose();
		}
	}

	/**
	 * Handle touch start for swipe detection
	 */
	function handleTouchStart(event: TouchEvent) {
		touchStartX = event.touches[0].clientX;
		touchStartY = event.touches[0].clientY;
	}

	/**
	 * Handle touch end for swipe detection
	 */
	function handleTouchEnd(event: TouchEvent) {
		if (!touchStartX || !touchStartY) return;

		const touchEndX = event.changedTouches[0].clientX;
		const touchEndY = event.changedTouches[0].clientY;

		const deltaX = touchStartX - touchEndX;
		const deltaY = Math.abs(touchStartY - touchEndY);

		// Check if it's a left swipe (deltaX > 50) and not too vertical (deltaY < 100)
		if (deltaX > 50 && deltaY < 100) {
			handleClose();
		}

		// Reset touch coordinates
		touchStartX = 0;
		touchStartY = 0;
	}

	/**
	 * Format amount for display
	 */
	function formatAmount(amount: number): string {
		return new Intl.NumberFormat().format(amount);
	}

	/**
	 * Get action button text based on scan result
	 */
	function getActionButtonText(): string {
		if (!scanResult || !scanResult.isValid) return '';

		switch (scanResult.type) {
			case QRDataType.LIGHTNING_INVOICE:
				return $t('scanner.payLightningInvoice');
			case QRDataType.BITCOIN_ADDRESS:
				return $t('scanner.sendToBitcoinAddress');
			case QRDataType.STARKNET_INVOICE:
				return $t('scanner.payStarknetInvoice');
			default:
				return $t('process');
		}
	}
</script>

<!-- Keyboard event listener -->
<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
	<!-- Modal backdrop -->
	<div
		class="modal-backdrop"
		class:results-active={!isScanning && !!scanResult && !!scanResult.isValid}
		on:click={handleBackdropClick}
		on:touchstart={handleTouchStart}
		on:touchend={handleTouchEnd}
		role="dialog"
		aria-modal="true"
		aria-labelledby="scan-modal-title"
	>
		<!-- Modal container -->
		<div class="modal-container">
			<!-- Modal content -->
			<div class="modal-content">
				{#if isScanning}
					<!-- Scanner view -->
					<div class="scanner-section">
						<!-- Close button -->
						<button
							class="close-button"
							on:click={handleClose}
							aria-label={$t('scanner.closeScanner')}
						>
							✕
						</button>

						<QRCodeScanner
							isActive={isOpen && isScanning}
							onScan={handleScan}
							onError={handleScannerError}
						/>

						<!-- Error message overlay -->
						{#if scanError}
							<div class="error-overlay">
								<button class="error-close-button" on:click={restartScan}>×</button>
								<div class="error-content">
									<div class="error-icon">⚠️</div>
									<h3>Unrecognized QR Code</h3>
									<p>{scanError}</p>
								</div>
							</div>
						{/if}
					</div>
				{:else if scanResult && scanResult.isValid}
					<!-- Results view -->
					<div class="results-section">
						<div class="result-header">
							<div class="result-icon">
								{getQRTypeIcon(scanResult.type)}
							</div>
							<div class="result-info">
								<h3>{getQRTypeDescription(scanResult.type)} Detected</h3>
								<p
									class="result-status"
									class:valid={scanResult.isValid}
									class:invalid={!scanResult.isValid}
								>
									{scanResult.isValid ? $t('errors.validFormat') : $t('errors.invalidFormat')}
								</p>
							</div>
						</div>

						{#if scanResult.isValid}
							<!-- Valid result details -->
							<div class="result-details">
								{#if scanResult.type === QRDataType.LIGHTNING_INVOICE}
									<div class="detail-item">
										<label>Invoice:</label>
										<div class="detail-value">
											<code>{scanResult.parsedData.invoice.substring(0, 40)}...</code>
										</div>
									</div>
									<div class="detail-item">
										<label>Type:</label>
										<div class="detail-value">{scanResult.parsedData.type}</div>
									</div>
								{:else if scanResult.type === QRDataType.BITCOIN_ADDRESS}
									<div class="detail-item">
										<label>Address:</label>
										<div class="detail-value">
											<code>{scanResult.parsedData.address}</code>
										</div>
									</div>
									<div class="detail-item">
										<label>Type:</label>
										<div class="detail-value">{scanResult.parsedData.type}</div>
									</div>
									{#if scanResult.parsedData.amount}
										<div class="detail-item">
											<label>Amount:</label>
											<div class="detail-value">
												{formatAmount(scanResult.parsedData.amount)} sats
											</div>
										</div>
									{/if}
									{#if scanResult.parsedData.label}
										<div class="detail-item">
											<label>Label:</label>
											<div class="detail-value">
												{scanResult.parsedData.label}
											</div>
										</div>
									{/if}
								{:else if scanResult.type === QRDataType.STARKNET_INVOICE}
									<div class="detail-item">
										<label>Recipient:</label>
										<div class="detail-value">
											<code>
												{scanResult.parsedData.recipientAddress.substring(
													0,
													20
												)}...{scanResult.parsedData.recipientAddress.substring(
													scanResult.parsedData.recipientAddress.length - 10
												)}
											</code>
										</div>
									</div>
									<div class="detail-item">
										<label>Amount:</label>
										<div class="detail-value">
											{formatAmount(scanResult.parsedData.amount)} sats
										</div>
									</div>
									<div class="detail-item">
										<label>Network:</label>
										<div class="detail-value">
											{scanResult.parsedData.network}
										</div>
									</div>
								{/if}
							</div>
						{:else}
							<!-- Invalid result error -->
							<div class="error-details">
								<p class="error-message">{scanResult.error}</p>
								<div class="raw-data">
									<label>Raw data:</label>
									<code>
										{scanResult.rawData.substring(0, 100)}{scanResult.rawData.length > 100
											? '...'
											: ''}
									</code>
								</div>
							</div>
						{/if}

						<!-- Action buttons -->
						<div class="result-actions">
							{#if scanResult.isValid}
								<Button variant="primary" size="large" on:click={processScannedData}>
									{getActionButtonText()}
								</Button>
							{/if}

							<Button variant="secondary" on:click={restartScan}>Scan Again</Button>
						</div>
					</div>
				{/if}

				<!-- Error display -->
				{#if scanError}
					<div class="error-banner">
						<span class="error-icon">⚠️</span>
						<span class="error-text">{scanError}</span>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: transparent;
		display: block;
		z-index: 99999;
		padding: 0;
		margin: 0;
	}

	/* When showing results, darken the backdrop so content is visible */
	.modal-backdrop.results-active {
		background: rgba(0, 0, 0, 0.85);
	}

	.modal-container {
		background: transparent;
		width: 100vw;
		height: 100vh;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		margin: 0;
		padding: 0;
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1.5rem;
		border-bottom: 1px solid var(--color-border, #333);
	}

	.modal-header h2 {
		margin: 0;
		color: #f69413;
		font-size: 1.25rem;
		font-weight: 600;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.close-button {
		background: none;
		border: none;
		color: var(--color-text-secondary, #888);
		font-size: 1.5rem;
		cursor: pointer;
		padding: 0.25rem;
		line-height: 1;
		transition: color 0.2s;
	}

	.close-button:hover {
		color: var(--color-text, #fff);
	}

	.modal-content {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
		padding: 0;
		margin: 0;
	}

	.scanner-section {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		margin: 0;
		padding: 0;
	}

	.error-overlay {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.9);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 10002;
	}

	.error-content {
		position: relative;
		background: rgba(255, 255, 255, 0.2);
		border-radius: 12px;
		padding: 2rem;
		text-align: center;
		color: white;
		max-width: 80%;
		border: 2px solid rgba(255, 255, 255, 0.3);
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
	}

	.error-icon {
		font-size: 3rem;
		margin-bottom: 1rem;
		text-align: center;
	}

	.error-content h3 {
		margin: 0 0 1rem 0;
		font-size: 1.25rem;
		font-weight: 600;
		color: #fff;
	}

	.error-content p {
		margin: 0;
		color: #ccc;
		font-size: 1rem;
		line-height: 1.4;
	}

	.error-close-button {
		position: absolute;
		top: 10px;
		right: 10px;
		background: rgba(0, 0, 0, 0.7);
		color: white;
		border: none;
		border-radius: 50%;
		width: 30px;
		height: 30px;
		font-size: 16px;
		cursor: pointer;
		z-index: 10003;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background-color 0.2s;
	}

	.error-close-button:hover {
		background: rgba(0, 0, 0, 0.9);
	}

	.close-button {
		position: absolute;
		top: 20px;
		right: 60px;
		background: rgba(0, 0, 0, 0.7);
		color: white;
		border: none;
		border-radius: 50%;
		width: 50px;
		height: 50px;
		font-size: 24px;
		cursor: pointer;
		z-index: 10000;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background-color 0.2s;
	}

	.close-button:hover {
		background: rgba(0, 0, 0, 0.9);
	}

	.scanner-instructions {
		text-align: center;
	}

	.scanner-instructions h3 {
		margin: 0 0 1rem 0;
		color: var(--color-text, #fff);
		font-size: 1rem;
		font-weight: 500;
	}

	.scanner-instructions p {
		margin: 0 0 0.5rem 0;
		color: var(--color-text-secondary, #bbb);
		font-size: 0.875rem;
	}

	.scanner-instructions ul {
		text-align: left;
		margin: 0.5rem 0 0 0;
		padding-left: 1.5rem;
		color: var(--color-text-secondary, #bbb);
		font-size: 0.875rem;
	}

	.scanner-instructions li {
		margin-bottom: 0.25rem;
	}

	.results-section {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.result-header {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem;
		background: var(--color-surface-variant, #2a2a2a);
		border-radius: 8px;
	}

	.result-icon {
		font-size: 2rem;
		flex-shrink: 0;
	}

	.result-info h3 {
		margin: 0 0 0.25rem 0;
		color: var(--color-text, #fff);
		font-size: 1.125rem;
		font-weight: 600;
	}

	.result-status {
		margin: 0;
		font-size: 0.875rem;
		font-weight: 500;
	}

	.result-status.valid {
		color: var(--color-success, #28a745);
	}

	.result-status.invalid {
		color: var(--color-error, #dc3545);
	}

	.result-details {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.detail-item {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.detail-item label {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--color-text-secondary, #bbb);
	}

	.detail-value {
		color: var(--color-text, #fff);
		font-size: 0.875rem;
	}

	.detail-value code {
		background: var(--color-surface-variant, #333);
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
		font-size: 0.75rem;
		word-break: break-all;
	}

	.error-details {
		padding: 1rem;
		background: var(--color-error-bg, rgba(244, 67, 54, 0.1));
		border: 1px solid var(--color-error, #dc3545);
		border-radius: 8px;
	}

	.error-message {
		margin: 0 0 1rem 0;
		color: var(--color-error, #dc3545);
		font-weight: 500;
	}

	.raw-data {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.raw-data label {
		font-size: 0.75rem;
		color: var(--color-text-secondary, #888);
		font-weight: 500;
	}

	.raw-data code {
		background: var(--color-surface-variant, #333);
		padding: 0.5rem;
		border-radius: 4px;
		font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
		font-size: 0.75rem;
		word-break: break-all;
		color: var(--color-text, #fff);
	}

	.result-actions {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.error-banner {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 1rem;
		background: var(--color-error-bg, rgba(244, 67, 54, 0.1));
		border: 1px solid var(--color-error, #dc3545);
		border-radius: 8px;
		margin-top: 1rem;
	}

	.error-icon {
		font-size: 1.25rem;
		flex-shrink: 0;
	}

	.error-text {
		color: var(--color-error, #dc3545);
		font-size: 0.875rem;
		font-weight: 500;
	}

	/* Chrome Permission Helper Styles */
	.chrome-helper {
		background: var(--color-surface-variant, #2a2a2a);
		border: 1px solid var(--color-border, #444);
		border-radius: 8px;
		margin-top: 1rem;
		padding: 1rem;
	}

	.chrome-helper-header {
		margin-bottom: 1rem;
	}

	.chrome-helper-header h4 {
		margin: 0 0 0.5rem 0;
		color: var(--color-text, #fff);
		font-size: 1rem;
		font-weight: 600;
	}

	.chrome-helper-header p {
		margin: 0;
		color: var(--color-text-secondary, #bbb);
		font-size: 0.875rem;
	}

	.chrome-instructions {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		margin: 1rem 0;
	}

	.quick-fix,
	.detailed-fix,
	.pwa-fix,
	.common-issues {
		background: var(--color-surface, #1a1a1a);
		border-radius: 6px;
		padding: 1rem;
	}

	.chrome-instructions h5 {
		margin: 0 0 0.75rem 0;
		color: var(--color-text, #fff);
		font-size: 0.875rem;
		font-weight: 600;
	}

	.chrome-instructions ol,
	.chrome-instructions ul {
		margin: 0;
		padding-left: 1.5rem;
		color: var(--color-text-secondary, #bbb);
		font-size: 0.8rem;
		line-height: 1.4;
	}

	.chrome-instructions li {
		margin-bottom: 0.5rem;
	}

	.issue-item {
		margin-bottom: 1rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--color-border, #333);
	}

	.issue-item:last-child {
		margin-bottom: 0;
		padding-bottom: 0;
		border-bottom: none;
	}

	.issue-item strong {
		display: block;
		color: var(--color-text, #fff);
		font-size: 0.8rem;
		font-weight: 600;
		margin-bottom: 0.25rem;
	}

	.issue-item p {
		margin: 0;
		color: var(--color-text-secondary, #bbb);
		font-size: 0.75rem;
		line-height: 1.3;
	}

	.chrome-helper-actions {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
		margin-top: 1rem;
	}

	/* Mobile optimizations */
	@media (max-width: 767px) {
		.modal-backdrop {
			padding: 0.5rem;
		}

		.modal-container {
			max-height: 95vh;
		}

		.modal-header,
		.modal-content {
			padding: 1rem;
		}

		.result-actions {
			flex-direction: column;
		}

		.scanner-instructions ul {
			padding-left: 1rem;
			font-size: 0.8rem;
		}
	}
</style>
