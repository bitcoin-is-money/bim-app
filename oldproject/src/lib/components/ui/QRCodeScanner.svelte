<!--
  @component
  QR Code Scanner Component
  
  A reusable component for scanning QR codes using the device camera.
  Handles camera permissions, stream management, and QR code detection.
  
  @prop onScan - Callback when QR code is successfully scanned
  @prop onError - Callback when error occurs
  @prop isActive - Whether scanner is currently active
  @prop facingMode - Camera facing mode ('user' | 'environment')
  
  @author bim
  @version 1.0.0
-->

<script lang="ts">
	import {
		getEnvironmentInfo,
		getPermissionResetInstructions,
		getPWACameraTroubleshootingGuide,
		isPermissionPermanentlyDenied,
		requestEnhancedCameraPermission,
		tryAlternativePermissionStrategies
	} from '$lib/utils/camera-permission';
	import { Html5Qrcode, Html5QrcodeSupportedFormats, Html5QrcodeScanType } from 'html5-qrcode';
	import { onDestroy, onMount } from 'svelte';

	// Component props
	export let onScan: (result: string) => void = () => {};
	export let onError: (error: string) => void = () => {};
	export let isActive = false;
	export let facingMode: 'user' | 'environment' = 'environment';

	// Component state
	let scanner: Html5Qrcode | null = null;
	let hasPermission = false;
	let permissionDenied = false;
	let isLoading = false;
	let errorMessage = '';
	let isPermanentlyDenied = false;
	let resetInstructions: any = null;

	// Camera stream state
	let currentStream: MediaStream | null = null;

	// Enhanced camera features
	let hasTorch = false;
	let isTorchOn = false;
	let availableCameras: MediaDeviceInfo[] = [];
	let currentCameraId: string | null = null;

	// Performance tracking
	let scanAttempts = 0;
	let lastScanTime = 0;
	let scanTimeout: NodeJS.Timeout | null = null;
	// Prevent repeated success emissions while teardown happens
	let hasEmittedSuccess = false;

	/**
	 * Initialize QR scanner
	 */
	async function initializeScanner() {
		try {
			isLoading = true;
			errorMessage = '';

			// Create scanner instance
			scanner = new Html5Qrcode('qr-reader');
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : 'Failed to initialize scanner';
			errorMessage = errorMsg;
			onError(errorMsg);
		} finally {
			isLoading = false;
		}
	}

	/**
	 * Start camera and scanning
	 */
	async function startScanning() {
		if (!isActive || !scanner) return;

		try {
			isLoading = true;
			errorMessage = '';
			permissionDenied = false;
			// Reset success guard on every fresh start
			hasEmittedSuccess = false;

			try {
				// Calculate responsive QR box size based on viewport
				const viewportWidth = window.innerWidth;
				const viewportHeight = window.innerHeight;
				const minDimension = Math.min(viewportWidth, viewportHeight);
				// Slightly larger crop box improves detection of bigger on-screen codes
				const qrBoxSize = Math.round(Math.min(380, Math.max(220, minDimension * 0.7)));

				// Use specific camera ID if available, otherwise use facing mode with graceful fallback
				const cameraConstraints = currentCameraId
					? { deviceId: { exact: currentCameraId } }
					: { facingMode: facingMode };

				await scanner.start(
					cameraConstraints,
					{
						fps: 24,
						qrbox: { width: qrBoxSize, height: qrBoxSize },
						aspectRatio: 1.0,
						// Performance and quality tunings
						formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
						experimentalFeatures: { useBarCodeDetectorIfSupported: true },
						rememberLastUsedCamera: true,
						disableFlip: true,
						supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA]
					},
					(decodedText) => {
						// Track successful scan
						const scanTime = Date.now();
						const timeSinceLastScan = scanTime - lastScanTime;
						lastScanTime = scanTime;

						// Clear any pending timeout
						if (scanTimeout) {
							clearTimeout(scanTimeout);
							scanTimeout = null;
						}

						// If scanner is no longer active (modal turned scanning off),
						// do not emit further scans or logs to avoid spam/races during teardown.
						if (!isActive) {
							return;
						}

						// If we've already emitted a successful scan, ignore further callbacks
						if (hasEmittedSuccess) {
							return;
						}

						console.log(
							`QR scan successful after ${scanAttempts} attempts in ${timeSinceLastScan}ms`
						);
						// Mark success to suppress duplicate logs/callbacks
						hasEmittedSuccess = true;
						onScan(decodedText);

						// Proactively stop scanning ASAP to avoid repeated callbacks
						// Defer to avoid blocking the library callback
						setTimeout(() => {
							// Best-effort stop; ignore errors
							stopScanning();
						}, 0);
					},
					(errorMessage) => {
						// Track scan attempts for performance monitoring
						scanAttempts++;

						// QR decode errors are normal and expected, but we can track them
						if (scanAttempts % 100 === 0) {
							console.debug(`QR scan attempts: ${scanAttempts}`);
						}
					}
				);

				hasPermission = true;

				// Optionally get camera stream for enhanced features (non-blocking)
				try {
					currentStream = await navigator.mediaDevices.getUserMedia(cameraConstraints);
					await checkTorchCapability();
					await optimizeCameraSettings();

					// Enable advanced features after basic scanning is working
					setTimeout(() => {
						enableAdvancedFeatures().catch((error) => {
							console.warn('Progressive enhancement failed:', error);
						});
					}, 1000); // Allow basic scanning to establish first
				} catch (error) {
					console.warn('Could not enable enhanced camera features:', error);
					// Continue without enhanced features
				}
			} catch (scannerError) {
				if (scannerError instanceof Error) {
					// Detailed error logging for debugging
					console.error('QR Scanner Error Details:', {
						name: scannerError.name,
						message: scannerError.message,
						stack: scannerError.stack,
						facingMode: facingMode,
						userAgent: navigator.userAgent,
						mediaDevicesSupported: !!navigator.mediaDevices,
						getUserMediaSupported: !!navigator.mediaDevices?.getUserMedia
					});

					if (scannerError.name === 'NotAllowedError') {
						permissionDenied = true;
						hasPermission = false;
						errorMessage =
							'Camera access was denied. Please allow camera access in your browser settings.';
					} else if (scannerError.name === 'NotFoundError') {
						errorMessage = 'No camera found. Please ensure your device has a camera.';
					} else if (scannerError.name === 'NotReadableError') {
						errorMessage = 'Camera is already in use by another application.';
					} else if (scannerError.name === 'OverconstrainedError') {
						console.warn('Camera constraints error, attempting fallback with minimal constraints');
						// Try to restart with absolute minimal constraints
						try {
							await scanner.start(
								{ facingMode: facingMode },
								{
									fps: 10,
									qrbox: { width: 200, height: 200 },
									aspectRatio: 1.0
								},
								(decodedText) => {
									if (!isActive || hasEmittedSuccess) return;
									hasEmittedSuccess = true;
									onScan(decodedText);
									setTimeout(() => {
										stopScanning();
									}, 0);
								},
								(errorMessage) => {}
							);
							hasPermission = true;
							return; // Exit early if successful
						} catch (fallbackError) {
							console.error('Fallback also failed:', fallbackError);
							errorMessage = 'Camera constraints could not be satisfied even with basic settings.';
						}
					} else {
						errorMessage = scannerError.message;
					}
				} else {
					console.error('Unknown QR scanner error:', scannerError);
					errorMessage = 'Failed to start QR scanner';
				}

				// Don't call onError to keep scanner active for error overlay
				// onError(errorMessage);
			}
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Failed to start scanner';
			// Don't call onError to keep scanner active for error overlay
			// onError(errorMessage);
		} finally {
			isLoading = false;
		}
	}

	/**
	 * Stop camera and scanning
	 */
	async function stopScanning() {
		if (scanner) {
			try {
				await scanner.stop();
			} catch (error) {
				// Ignore stop errors
			}
		}
		hasPermission = false;

		// Stop any active stream
		if (currentStream) {
			try {
				currentStream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
				currentStream = null;
			} catch (error) {
				// Ignore stream stop errors
			}
		}

		// Clear performance tracking
		clearPerformanceTracking();
	}

	/**
	 * Clear performance tracking data and timeouts
	 */
	function clearPerformanceTracking() {
		if (scanTimeout) {
			clearTimeout(scanTimeout);
			scanTimeout = null;
		}
		scanAttempts = 0;
		lastScanTime = 0;
	}

	/**
	 * Enumerate available cameras (optional enhancement)
	 */
	async function enumerateCameras() {
		try {
			// Only attempt camera enumeration if supported and not causing issues
			if (!navigator.mediaDevices?.enumerateDevices) {
				console.warn('Camera enumeration not supported');
				return;
			}

			const devices = await navigator.mediaDevices.enumerateDevices();
			availableCameras = devices.filter((device) => device.kind === 'videoinput');

			// Set default camera based on facing mode (optional)
			if (availableCameras.length > 0 && !currentCameraId) {
				const preferredCamera =
					availableCameras.find((camera) =>
						facingMode === 'environment'
							? camera.label.toLowerCase().includes('back') ||
								camera.label.toLowerCase().includes('rear')
							: camera.label.toLowerCase().includes('front') ||
								camera.label.toLowerCase().includes('user')
					) || availableCameras[0];

				currentCameraId = preferredCamera.deviceId;
			}
		} catch (error) {
			console.warn('Could not enumerate cameras (continuing with basic features):', error);
			// Reset to prevent issues with basic scanning
			availableCameras = [];
			currentCameraId = null;
		}
	}

	/**
	 * Switch camera (front/back)
	 */
	async function switchCamera() {
		if (!scanner) return;

		try {
			const newFacingMode = facingMode === 'user' ? 'environment' : 'user';
			// Restart scanner with new camera mode
			await stopScanning();
			facingMode = newFacingMode;

			// Update camera selection based on new facing mode
			await enumerateCameras();

			await startScanning();
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : 'Failed to switch camera';
			onError(`Failed to switch camera: ${errorMsg}`);
		}
	}

	/**
	 * Toggle device torch/flashlight
	 */
	async function toggleTorch() {
		if (!currentStream) return;

		try {
			const track = currentStream.getVideoTracks()[0];
			if (!track) return;

			const capabilities = track.getCapabilities?.();
			if (!capabilities?.torch) {
				console.warn('Torch not supported on this device');
				return;
			}

			const settings = track.getSettings();
			const newTorchState = !isTorchOn;

			await track.applyConstraints({
				advanced: [{ torch: newTorchState }]
			});

			isTorchOn = newTorchState;
		} catch (error) {
			console.warn('Failed to toggle torch:', error);
		}
	}

	/**
	 * Check torch capability (optional enhancement)
	 */
	async function checkTorchCapability() {
		if (!currentStream) {
			hasTorch = false;
			return;
		}

		/**
		 * Try to optimize camera track settings for scanning (best-effort)
		 * Enables continuous focus/auto exposure/white balance when supported.
		 */
		async function optimizeCameraSettings() {
			try {
				if (!currentStream) return;
				const track = currentStream.getVideoTracks()[0];
				// Some browsers expose capabilities; apply only if supported
				const caps = track.getCapabilities?.() as any;
				const advanced: any[] = [];
				if (
					caps?.focusMode &&
					Array.isArray(caps.focusMode) &&
					caps.focusMode.includes('continuous')
				) {
					advanced.push({ focusMode: 'continuous' });
				}
				if (
					caps?.exposureMode &&
					Array.isArray(caps.exposureMode) &&
					caps.exposureMode.includes('continuous')
				) {
					advanced.push({ exposureMode: 'continuous' });
				}
				if (
					caps?.whiteBalanceMode &&
					Array.isArray(caps.whiteBalanceMode) &&
					caps.whiteBalanceMode.includes('continuous')
				) {
					advanced.push({ whiteBalanceMode: 'continuous' });
				}
				if (advanced.length > 0) {
					await track.applyConstraints({ advanced });
				}
			} catch (e) {
				// Silently ignore if not supported
				console.debug('optimizeCameraSettings not supported:', e);
			}
		}

		try {
			const track = currentStream.getVideoTracks()[0];
			if (!track || !track.getCapabilities) {
				hasTorch = false;
				return;
			}

			const capabilities = track.getCapabilities();
			hasTorch = capabilities?.torch === true;
		} catch (error) {
			console.warn('Could not check torch capability (continuing without flash):', error);
			hasTorch = false;
		}
	}

	/**
	 * Progressive enhancement for camera capabilities
	 */
	async function enableAdvancedFeatures() {
		if (!hasPermission || !currentStream) return;

		try {
			// Only attempt advanced features after basic scanning is established
			const track = currentStream.getVideoTracks()[0];
			if (!track) return;

			// Try to apply enhanced constraints progressively
			const enhancedConstraints = {
				width: { ideal: 1280 },
				height: { ideal: 720 },
				focusMode: 'continuous'
			};

			try {
				await track.applyConstraints(enhancedConstraints);
				console.log('Enhanced camera features enabled');
			} catch (error) {
				console.warn('Could not apply enhanced constraints, continuing with basic camera:', error);
			}
		} catch (error) {
			console.warn('Advanced features not available:', error);
		}
	}

	/**
	 * Check if permission is permanently denied and get reset instructions
	 */
	async function checkPermissionStatus() {
		try {
			isPermanentlyDenied = await isPermissionPermanentlyDenied();
			if (isPermanentlyDenied) {
				// Get PWA-specific troubleshooting if in PWA context
				const env = getEnvironmentInfo();
				if (env.isPWA) {
					resetInstructions = getPWACameraTroubleshootingGuide();
				} else {
					resetInstructions = getPermissionResetInstructions();
				}
			}
		} catch (error) {
			// Ignore permission check errors
		}
	}

	/**
	 * Close error message and restart scanning
	 */
	async function closeErrorAndRetry() {
		errorMessage = '';
		// Reset scanner states
		hasPermission = false;
		permissionDenied = false;
		isLoading = false;

		// Reinitialize and start scanning
		await initializeScanner();
		if (isActive) {
			await startScanning();
		}
	}

	/**
	 * Try alternative permission request strategies
	 */
	async function tryAlternativeStrategies() {
		if (!scanner) {
			return;
		}

		try {
			isLoading = true;
			errorMessage = '';

			const success = await tryAlternativePermissionStrategies();

			if (success) {
				// Reset states
				permissionDenied = false;
				isPermanentlyDenied = false;
				resetInstructions = null;
				hasPermission = false;

				// Calculate responsive QR box size based on viewport
				const viewportWidth = window.innerWidth;
				const viewportHeight = window.innerHeight;
				const minDimension = Math.min(viewportWidth, viewportHeight);
				const qrBoxSize = Math.min(300, Math.max(200, minDimension * 0.6));

				// Start the scanner with basic constraints
				await scanner.start(
					{ facingMode: facingMode },
					{
						fps: 20, // Increased from 10 to 20 for faster detection
						qrbox: { width: qrBoxSize, height: qrBoxSize }, // Dynamic sizing
						aspectRatio: 1.0
					},
					(decodedText) => {
						// If scanner is no longer active, drop callbacks immediately
						if (!isActive) return;

						// Track successful scan
						const scanTime = Date.now();
						const timeSinceLastScan = scanTime - lastScanTime;
						lastScanTime = scanTime;

						// Clear any pending timeout
						if (scanTimeout) {
							clearTimeout(scanTimeout);
							scanTimeout = null;
						}

						console.log(
							`QR scan successful after ${scanAttempts} attempts in ${timeSinceLastScan}ms`
						);
						onScan(decodedText);
					},
					(errorMessage) => {
						// Track scan attempts for performance monitoring
						scanAttempts++;

						// QR decode errors are normal and expected, but we can track them
						if (scanAttempts % 100 === 0) {
							console.debug(`QR scan attempts: ${scanAttempts}`);
						}
					}
				);
				hasPermission = true;
			} else {
				throw new Error('All alternative strategies failed');
			}
		} catch (error) {
			errorMessage = 'Unable to access camera. Please check permissions manually.';
		} finally {
			isLoading = false;
		}
	}

	/**
	 * Request camera permissions and start scanner
	 */
	async function requestPermissions() {
		if (!scanner) {
			return;
		}

		try {
			isLoading = true;
			errorMessage = '';

			// Use the enhanced PWA-aware permission utility
			await requestEnhancedCameraPermission();

			// Reset denial states
			permissionDenied = false;
			isPermanentlyDenied = false;
			resetInstructions = null;

			// Update states
			hasPermission = false; // Will be set to true when scanner starts

			// Start the scanner directly without going through startScanning()
			// to avoid permission check conflicts

			// Calculate responsive QR box size based on viewport
			const viewportWidth = window.innerWidth;
			const viewportHeight = window.innerHeight;
			const minDimension = Math.min(viewportWidth, viewportHeight);
			const qrBoxSize = Math.min(300, Math.max(200, minDimension * 0.6));

			await scanner.start(
				{ facingMode: facingMode },
				{
					fps: 20, // Increased from 10 to 20 for faster detection
					qrbox: { width: qrBoxSize, height: qrBoxSize }, // Dynamic sizing
					aspectRatio: 1.0
				},
				(decodedText) => {
					if (!isActive) return;
					onScan(decodedText);
				},
				(errorMessage) => {
					// QR decode errors are normal and expected
				}
			);
			hasPermission = true;
		} catch (error) {
			if (error instanceof Error && error.message === 'PERMISSION_PERMANENTLY_DENIED') {
				// Handle permanently denied permissions
				await checkPermissionStatus();
				permissionDenied = true;
				hasPermission = false;
				errorMessage = 'Camera permission was permanently denied. Please reset it manually.';
			} else if (error instanceof Error) {
				if (error.name === 'NotAllowedError' || error.message.includes('denied')) {
					// Check if it's permanently denied
					await checkPermissionStatus();
					permissionDenied = true;
					hasPermission = false;

					if (isPermanentlyDenied) {
						errorMessage = 'Camera permission was permanently denied. Please reset it manually.';
					} else {
						errorMessage =
							'Camera access was denied. Please allow camera access in your browser settings.';
					}
				} else {
					permissionDenied = false;
					hasPermission = false;
					errorMessage = error.message;
				}
			} else {
				permissionDenied = true;
				hasPermission = false;
				errorMessage = 'Camera permission is required to scan QR codes';
			}

			// Don't call onError here as it might close the modal
			// Just show the error in the UI
		} finally {
			isLoading = false;
		}
	}

	/**
	 * Check if browser supports camera scanning
	 */
	function isScanningSupported(): boolean {
		return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
	}

	// Reactive statements
	$: if (isActive && scanner && !hasPermission && !permissionDenied && !isLoading) {
		console.log('🔍 QRCodeScanner: Starting scanner due to isActive change:', {
			isActive,
			hasScanner: !!scanner,
			hasPermission,
			permissionDenied,
			isLoading,
			timestamp: new Date().toISOString()
		});
		startScanning();
	}

	$: if (!isActive && scanner && hasPermission) {
		console.log('🔍 QRCodeScanner: Stopping scanner due to isActive change:', {
			isActive,
			hasScanner: !!scanner,
			hasPermission,
			timestamp: new Date().toISOString()
		});
		stopScanning();
	}

	// Lifecycle
	onMount(async () => {
		if (!isScanningSupported()) {
			errorMessage = 'Camera scanning is not supported in this browser';
			onError(errorMessage);
			return;
		}

		// Initialize scanner when component mounts
		await initializeScanner();

		// Enumerate available cameras in background (non-blocking)
		enumerateCameras().catch((error) => {
			console.warn('Camera enumeration failed, continuing with basic functionality:', error);
		});

		// Check permission status on mount
		await checkPermissionStatus();

		// Don't auto-start - let reactive statements handle it
		// This avoids conflicts with permission handling
	});

	onDestroy(() => {
		// Clear performance tracking
		clearPerformanceTracking();

		// Cleanup
		if (scanner) {
			try {
				scanner.clear();
				scanner = null;
			} catch (error) {
				// Ignore cleanup errors
			}
		}
		// Safely stop any remaining tracks
		if (currentStream) {
			try {
				const tracks = currentStream.getTracks();
				tracks.forEach((track) => track.stop());
				currentStream = null;
			} catch (error) {
				// Ignore track stop errors
			}
		}

		// Reset camera state
		hasTorch = false;
		isTorchOn = false;
		availableCameras = [];
		currentCameraId = null;
	});
</script>

<div class="qr-scanner-container">
	<!-- HTML5 QR Scanner container -->
	<div id="qr-reader" class="html5-qr-reader"></div>

	<!-- Camera controls overlay -->
	{#if hasPermission && !isLoading && !permissionDenied}
		<div class="camera-controls">
			<!-- Torch/flashlight button -->
			{#if hasTorch}
				<button
					class="control-button"
					class:active={isTorchOn}
					on:click={toggleTorch}
					aria-label="Toggle flashlight"
				>
					{isTorchOn ? '🔦' : '💡'}
				</button>
			{/if}
		</div>
	{/if}

	<!-- Loading state -->
	{#if isLoading}
		<div class="scanner-overlay loading-overlay">
			<div class="loading-spinner"></div>
			<p>Starting camera...</p>
		</div>
	{/if}

	<!-- Permission denied state -->
	{#if permissionDenied}
		<div class="scanner-overlay permission-overlay">
			<div class="permission-icon">📷</div>

			{#if isPermanentlyDenied && resetInstructions}
				<!-- Permanently denied - show reset instructions -->
				<h3>Permission Reset Required</h3>
				<p>
					Camera access was permanently denied. Please follow these steps to reset the permission:
				</p>

				<div class="reset-instructions">
					<h4>{resetInstructions.title}</h4>
					<ol class="instruction-steps">
						{#each resetInstructions.steps as step}
							<li>{step}</li>
						{/each}
					</ol>

					{#if resetInstructions.additionalTips && resetInstructions.additionalTips.length > 0}
						<div class="additional-tips">
							<h5>💡 GrapheneOS Tips:</h5>
							<ul class="tips-list">
								{#each resetInstructions.additionalTips as tip}
									<li>{tip}</li>
								{/each}
							</ul>
						</div>
					{/if}
				</div>

				<div class="permission-actions">
					<button class="permission-button secondary" on:click={tryAlternativeStrategies}>
						Try Alternative Methods
					</button>
					<button class="permission-button" on:click={requestPermissions}>
						Test Permission Reset
					</button>
				</div>
			{:else}
				<!-- Standard permission denied -->
				<h3>Camera Permission Required</h3>
				<p>To scan QR codes, please allow camera access in your browser.</p>

				<div class="permission-actions">
					<button class="permission-button" on:click={requestPermissions}>
						Allow Camera Access
					</button>
					<button class="permission-button secondary" on:click={tryAlternativeStrategies}>
						Try Different Method
					</button>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Error state -->
	{#if errorMessage && !permissionDenied && !isLoading}
		<div class="scanner-overlay error-overlay">
			<div class="error-icon">⚠️</div>
			<h3>Scanner Error</h3>
			<p>{errorMessage}</p>
			<div class="error-actions">
				<button class="retry-button" on:click={closeErrorAndRetry}>Try Again</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.qr-scanner-container {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		border-radius: 0;
		overflow: hidden;
		display: block;
		z-index: 9999;
		margin: 0;
		padding: 0;
		background: #000; /* Full black background */
	}

	.scanner-video {
		width: 100% !important;
		height: 100% !important;
		object-fit: cover !important;
		display: block !important;
		position: relative !important;
		z-index: 1;
	}

	/* Force HTML5 QR Code library video to be full screen */
	:global(.html5-qr-reader video) {
		width: 100% !important;
		height: 100% !important;
		object-fit: cover !important;
		position: absolute !important;
		top: 0 !important;
		left: 0 !important;
		z-index: 1 !important;
	}

	:global(.html5-qr-reader) {
		width: 100% !important;
		height: 100% !important;
		position: absolute !important;
		top: 0 !important;
		left: 0 !important;
		background: #000 !important; /* Full black background */
		z-index: 1 !important;
	}

	/* Ensure HTML5 QR reader internal elements don't interfere with overlays */
	:global(.html5-qr-reader *:not(video)) {
		z-index: 1 !important;
	}

	.scanner-video.hidden {
		display: none !important;
	}

	.scanner-video.active {
		display: block !important;
	}

	.scanner-overlay {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.8);
		color: white;
		text-align: center;
		padding: 2rem;
		z-index: 10;
	}

	.loading-overlay {
		background: rgba(0, 0, 0, 0.9);
	}

	.loading-spinner {
		width: 40px;
		height: 40px;
		border: 3px solid #333;
		border-top: 3px solid #fff;
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin-bottom: 1rem;
	}

	@keyframes spin {
		0% {
			transform: rotate(0deg);
		}
		100% {
			transform: rotate(360deg);
		}
	}

	.permission-overlay,
	.error-overlay {
		background: rgba(0, 0, 0, 0.95);
		z-index: 20;
	}

	.permission-icon,
	.error-icon {
		font-size: 3rem;
		margin-bottom: 1rem;
	}

	.permission-overlay h3,
	.error-overlay h3 {
		margin: 0 0 1rem 0;
		font-size: 1.25rem;
		color: #fff;
	}

	.permission-overlay p,
	.error-overlay p {
		margin: 0 0 1.5rem 0;
		color: #ccc;
		line-height: 1.4;
	}

	.permission-button,
	.retry-button {
		background: #0070f3;
		color: white;
		border: none;
		padding: 0.75rem 1.5rem;
		border-radius: 6px;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: background-color 0.2s;
		margin: 0.25rem;
	}

	.permission-button:hover,
	.retry-button:hover {
		background: #0051a2;
	}

	.permission-button.secondary {
		background: #666;
		color: white;
	}

	.permission-button.secondary:hover {
		background: #555;
	}

	.permission-actions {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		align-items: center;
		margin-top: 1rem;
	}

	.error-actions {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		align-items: center;
		margin-top: 1rem;
	}

	.reset-instructions {
		background: rgba(255, 255, 255, 0.1);
		padding: 1rem;
		border-radius: 8px;
		margin: 1rem 0;
		text-align: left;
		max-width: 100%;
		overflow-x: auto;
	}

	.reset-instructions h4 {
		margin: 0 0 0.75rem 0;
		color: #fff;
		font-size: 0.95rem;
		font-weight: 600;
	}

	.instruction-steps {
		margin: 0;
		padding-left: 1.25rem;
		color: #ddd;
		font-size: 0.8rem;
		line-height: 1.4;
	}

	.instruction-steps li {
		margin-bottom: 0.4rem;
		white-space: pre-line;
	}

	.additional-tips {
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid rgba(255, 255, 255, 0.2);
	}

	.additional-tips h5 {
		margin: 0 0 0.5rem 0;
		color: #fff;
		font-size: 0.85rem;
		font-weight: 600;
	}

	.tips-list {
		margin: 0;
		padding-left: 0;
		list-style: none;
		color: #ddd;
		font-size: 0.75rem;
		line-height: 1.3;
	}

	.tips-list li {
		margin-bottom: 0.3rem;
		padding-left: 0.5rem;
		position: relative;
	}

	.tips-list li:before {
		content: '';
		position: absolute;
		left: 0;
		top: 0.4rem;
		width: 3px;
		height: 3px;
		background: #0070f3;
		border-radius: 50%;
	}

	.html5-qr-reader {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		z-index: 2;
		margin: 0;
		padding: 0;
	}

	.camera-controls {
		position: absolute;
		bottom: 20px;
		right: 20px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		z-index: 15;
	}

	.control-button {
		background: rgba(0, 0, 0, 0.7);
		color: white;
		border: none;
		border-radius: 50%;
		width: 50px;
		height: 50px;
		font-size: 20px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s ease;
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
		border: 2px solid rgba(255, 255, 255, 0.2);
	}

	.control-button:hover {
		background: rgba(0, 0, 0, 0.9);
		transform: scale(1.1);
		border-color: rgba(255, 255, 255, 0.4);
	}

	.control-button.active {
		background: rgba(255, 165, 0, 0.8);
		border-color: rgba(255, 165, 0, 0.6);
	}

	.control-button.active:hover {
		background: rgba(255, 165, 0, 1);
	}

	/* Mobile optimizations */
	@media (max-width: 767px) {
		.scanner-overlay {
			padding: 1rem;
		}

		.reset-instructions {
			padding: 0.75rem;
			margin: 0.75rem 0;
		}

		.instruction-steps {
			font-size: 0.75rem;
			padding-left: 1rem;
		}

		.permission-actions {
			flex-direction: column;
			width: 100%;
		}

		.permission-button {
			width: 100%;
			max-width: 280px;
		}
	}
</style>
