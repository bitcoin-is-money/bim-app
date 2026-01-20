<!--
  @component
  QR Code Component
  
  A reusable component for generating QR codes using the qrcode library.
  Supports customizable size, error handling, and proper styling.
  
  @props data - The data to encode in the QR code
  @props size - The size of the QR code in pixels (default: 250)
  @props errorMessage - Custom error message to display if QR generation fails
  
  @author bim
  @version 1.0.0
-->

<script lang="ts">
	import { onMount } from 'svelte';
	import QRCodeLib from 'qrcode';

	// Component props
	export let data: string;
	export let size: number = 400; // Increased from 250 to 400 for better readability
	export let errorMessage: string = 'Failed to generate QR code';

	// Component state
	let canvas: HTMLCanvasElement;
	let error = '';
	let isLoading = true;

	// Flag to prevent multiple simultaneous generations
	let isGenerating = false;

	// Track the last data that was successfully generated to prevent unnecessary regeneration
	let lastGeneratedData = '';

	// Enhanced validation states
	let validationAttempts = 0;

	/**
	 * Generate QR code and render to canvas
	 */
	async function generateQRCode() {
		// Prevent multiple simultaneous generations
		if (isGenerating) return;

		// Validate canvas element
		if (!canvas) {
			error = 'Canvas element not ready';
			isLoading = false;
			return;
		}

		// Enhanced data validation
		if (!data || typeof data !== 'string' || data.trim() === '') {
			error = 'No data provided for QR code';
			isLoading = false;
			return;
		}

		// Additional validation for common data formats
		const trimmedData = data.trim();
		if (trimmedData.length < 5) {
			error = 'QR data too short';
			lastValidationError = `Data too short: ${trimmedData.length} characters`;
			isLoading = false;
			return;
		}

		try {
			// Only log if this is the first attempt or every 10th attempt to reduce spam
			if (validationAttempts === 0 || validationAttempts % 10 === 0) {
				console.log('🎨 QRCode generation starting:', {
					dataLength: data.length,
					dataType: typeof data,
					dataPreview: data.substring(0, 100) + '...',
					size,
					attempt: validationAttempts + 1,
					timestamp: new Date().toISOString()
				});
			}

			isGenerating = true;
			isLoading = true;
			error = '';
			validationAttempts++;

			// Generate QR code with enhanced options and timeout
			const generatePromise = QRCodeLib.toCanvas(canvas, data, {
				width: size,
				// Slightly larger quiet zone helps mobile scanners
				margin: 6,
				color: {
					dark: '#000000',
					light: '#FFFFFF'
				},
				// Keep high EC by default; can be tuned in future if needed
				errorCorrectionLevel: 'H',
				rendererOpts: { quality: 1.0 }
			});

			// Add timeout to prevent hanging
			const timeoutPromise = new Promise((_, reject) => {
				setTimeout(() => reject(new Error('QR generation timeout')), 5000);
			});

			await Promise.race([generatePromise, timeoutPromise]);

			// Only log success if this was a retry or first success
			if (validationAttempts === 1 || validationAttempts % 10 === 0) {
				console.log('✅ QRCode generation successful:', {
					dataLength: data.length,
					size,
					attempt: validationAttempts,
					timestamp: new Date().toISOString()
				});
			}

			// Track the successfully generated data
			lastGeneratedData = data;
			isLoading = false;
		} catch (err) {
			console.error('QR Code generation failed:', {
				error: err,
				data: data.substring(0, 100) + '...',
				attempt: validationAttempts,
				canvasElement: !!canvas
			});

			if (err instanceof Error && err.message.includes('timeout')) {
				error = 'QR generation timed out - please try again';
			} else {
				error = errorMessage || 'Failed to generate QR code';
			}

			lastValidationError = err instanceof Error ? err.message : String(err);
			// Reset lastGeneratedData on error so it can retry
			lastGeneratedData = '';
			isLoading = false;
		} finally {
			isGenerating = false;
		}
	}

	// Generate QR code when component is ready
	onMount(() => {
		console.log('🎨 QRCode component mounted:', {
			hasData: !!data,
			dataType: typeof data,
			dataLength: data?.length,
			hasCanvas: !!canvas,
			timestamp: new Date().toISOString()
		});

		// Try to generate after mount if data is available
		if (data && typeof data === 'string' && data.trim()) {
			// Small delay to ensure canvas is bound
			setTimeout(() => {
				generateQRCode();
			}, 100);
		}
	});

	// Watch for data changes and regenerate only when data actually changes
	$: if (
		data &&
		typeof data === 'string' &&
		data.trim() &&
		canvas &&
		!isGenerating &&
		data !== lastGeneratedData
	) {
		// Only log reactive triggers for debugging, not on every change
		if (validationAttempts === 0 || data.length < 100) {
			console.log('🎨 QRCode reactive statement triggered:', {
				hasData: !!data,
				hasCanvas: !!canvas,
				isGenerating,
				dataChanged: data !== lastGeneratedData,
				timestamp: new Date().toISOString()
			});
		}
		generateQRCode();
	}

	// Handle missing data
	$: if (!data || !data.trim()) {
		error = data === undefined ? 'Waiting for data...' : 'No data provided';
		isLoading = false;
	}
</script>

<div class="qr-code-container">
	<!-- Canvas always exists so binding works - visibility controlled by CSS -->
	<canvas
		bind:this={canvas}
		class="qr-canvas"
		style="width: {size}px; height: {size}px; display: {isLoading || error ? 'none' : 'block'};"
	></canvas>

	<!-- Loading state overlay -->
	{#if isLoading}
		<div class="qr-loading" style="width: {size}px; height: {size}px;">
			<div class="loading-spinner"></div>
			<p>Generating QR code...</p>
		</div>
	{/if}

	<!-- Error state overlay -->
	{#if error}
		<div class="qr-error" style="width: {size}px; height: {size}px;">
			<div class="error-icon">⚠️</div>
			<p>{error}</p>
		</div>
	{/if}
</div>

<style>
	.qr-code-container {
		position: relative;
		display: flex;
		justify-content: center;
		align-items: center;
	}

	.qr-canvas {
		border: 2px solid #333;
		border-radius: 8px;
		background: #fff;
	}

	.qr-loading,
	.qr-error {
		position: absolute;
		top: 0;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		border: 2px dashed #555;
		border-radius: 8px;
		background: #1a1a1a;
		color: #b0b0b0;
		text-align: center;
		padding: 20px;
		z-index: 10;
	}

	.loading-spinner {
		width: 32px;
		height: 32px;
		border: 3px solid #333;
		border-top: 3px solid #666;
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin-bottom: 10px;
	}

	@keyframes spin {
		0% {
			transform: rotate(0deg);
		}
		100% {
			transform: rotate(360deg);
		}
	}

	.error-icon {
		font-size: 32px;
		margin-bottom: 10px;
	}

	.qr-loading p,
	.qr-error p {
		margin: 0;
		font-size: 14px;
	}

	.qr-error {
		border-color: #ff9800;
		color: #ff9800;
	}

	/* Responsive design */
	@media (max-width: 767px) {
		.qr-canvas,
		.qr-loading,
		.qr-error {
			max-width: 320px; /* Increased from 200px to improve readability on mobile */
			max-height: 320px;
		}
	}
</style>
