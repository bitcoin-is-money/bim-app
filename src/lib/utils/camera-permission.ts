/**
 * Camera Permission Utilities
 *
 * Functions to handle camera permission requests when users
 * actually try to use QR code scanning functionality.
 * Includes enhanced support for PWA environments.
 */

/**
 * Detect if running as a PWA
 */
export function isPWA(): boolean {
	return window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
}

/**
 * Detect if running on Android
 */
export function isAndroid(): boolean {
	return /Android/i.test(navigator.userAgent);
}

/**
 * Detect if running on mobile device
 */
export function isMobile(): boolean {
	return /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/**
 * Detect if running on Vanadium browser (GrapheneOS)
 */
export function isVanadium(): boolean {
	const userAgent = navigator.userAgent;

	// Primary check: explicit Vanadium identifier
	if (/Vanadium/i.test(userAgent)) {
		return true;
	}

	// Secondary check: GrapheneOS-specific Chrome behaviors
	// Vanadium identifies as Chrome but has different characteristics
	if (userAgent.includes('Chrome') && userAgent.includes('Mobile')) {
		// Check for absence of Google services indicators (common in GrapheneOS)
		const hasGoogleIndicators =
			userAgent.includes('GoogleBot') ||
			userAgent.includes('Google') ||
			userAgent.includes('GSA/') ||
			userAgent.includes('PlayServices');

		// Vanadium typically lacks these Google-specific identifiers
		// Also check for very specific Chrome version patterns that might indicate Vanadium
		const isLikelyVanadium =
			!hasGoogleIndicators &&
			!userAgent.includes('wv') && // Not WebView
			!userAgent.includes('SamsungBrowser') && // Not Samsung Browser
			!userAgent.includes('UCBrowser'); // Not UC Browser

		// Additional heuristic: check for privacy-focused features
		const hasPrivacyFeatures =
			navigator.permissions &&
			typeof navigator.permissions.query === 'function' &&
			!userAgent.includes('Chrome/1'); // Avoid very old Chrome versions

		return isLikelyVanadium && hasPrivacyFeatures;
	}

	return false;
}

/**
 * Detect if running on stock Android Chrome (not GrapheneOS/Vanadium)
 */
export function isStockAndroidChrome(): boolean {
	const userAgent = navigator.userAgent;

	// Must be Chrome on Android
	if (!userAgent.includes('Chrome') || !userAgent.includes('Android')) {
		return false;
	}

	// Must not be Vanadium or GrapheneOS
	if (isVanadium()) {
		return false;
	}

	// Must not be WebView
	if (userAgent.includes('wv')) {
		return false;
	}

	// Check for Google services indicators (common in stock Android)
	const hasGoogleIndicators =
		userAgent.includes('Google') ||
		userAgent.includes('GSA/') ||
		userAgent.includes('PlayServices');

	// Stock Chrome typically has standard Chrome version patterns
	const hasStandardChromePattern = /Chrome\/\d+\.\d+\.\d+\.\d+/.test(userAgent);

	return hasStandardChromePattern && !userAgent.includes('Vanadium');
}

/**
 * Enhanced GrapheneOS detection
 */
export function isGrapheneOS(): boolean {
	const userAgent = navigator.userAgent;

	// Check for Vanadium browser (strong indicator of GrapheneOS)
	const isVanadium = /Vanadium/i.test(userAgent);

	// Check for other GrapheneOS indicators
	const hasGrapheneOSIndicators =
		userAgent.includes('Chrome') &&
		userAgent.includes('Mobile') &&
		!userAgent.includes('wv') && // Not WebView
		!userAgent.includes('Edg') && // Not Edge
		!userAgent.includes('Firefox'); // Not Firefox

	// Additional checks for GrapheneOS-specific behavior
	const hasGrapheneOSPrivacyFeatures =
		navigator.permissions && typeof navigator.permissions.query === 'function';

	return isVanadium || (hasGrapheneOSIndicators && hasGrapheneOSPrivacyFeatures);
}

/**
 * Get GrapheneOS-specific camera troubleshooting guide
 */
export function getGrapheneOSChromeTroubleshootingGuide(): {
	title: string;
	steps: string[];
	advancedSteps: string[];
	privacySettings: string[];
	commonIssues: Array<{ issue: string; solution: string }>;
} {
	return {
		title: 'GrapheneOS Chrome Camera Permission Troubleshooting',
		steps: [
			"1. Ensure you're using HTTPS (required for camera access)",
			'2. Open Chrome browser on your GrapheneOS device',
			"3. Navigate to this site's URL",
			'4. Tap the lock icon in the address bar',
			'5. Look for "Camera" permission and tap it',
			'6. Select "Allow for this site"',
			'7. Refresh the page and try again',
			"8. If permission dialog doesn't appear, try the advanced steps below"
		],
		advancedSteps: [
			'1. Go to Chrome Settings (⋮ menu)',
			'2. Select "Site Settings"',
			'3. Tap "Camera"',
			'4. Find this site in the list and change to "Allow"',
			'5. If site is not listed, go to "All sites"',
			'6. Find this domain and tap it',
			'7. Change camera setting to "Allow"',
			'8. Return to site and refresh',
			'9. If still not working, try the privacy settings below'
		],
		privacySettings: [
			'1. Go to Android Settings > Apps',
			'2. Find "Chrome" and tap it',
			'3. Tap "Permissions"',
			'4. Ensure "Camera" is set to "Allow"',
			'5. If "Camera" is not listed, tap "See all permissions"',
			'6. Find "Camera" and set to "Allow"',
			'7. Go back to Chrome and try again',
			'8. If still blocked, check GrapheneOS privacy settings:',
			'   - Settings > Privacy > Camera',
			'   - Ensure Chrome has camera access',
			'   - Settings > Privacy > Sensors',
			'   - Ensure camera sensors are not blocked'
		],
		commonIssues: [
			{
				issue: 'Permission dialog never appears',
				solution:
					'GrapheneOS may block permission dialogs. Check Android Settings > Apps > Chrome > Permissions > Camera'
			},
			{
				issue: 'Permission denied immediately',
				solution:
					'GrapheneOS privacy settings may be blocking camera. Check Settings > Privacy > Camera'
			},
			{
				issue: 'Camera works on other sites but not this one',
				solution:
					'Site-specific permission issue. Grant permission specifically for this domain in Chrome settings'
			},
			{
				issue: 'Camera shows "permission denied"',
				solution:
					'GrapheneOS may have blocked the permission. Check both Chrome and Android system permissions'
			},
			{
				issue: 'getUserMedia fails silently',
				solution:
					'GrapheneOS may be blocking camera access at system level. Check Settings > Privacy > Camera'
			}
		]
	};
}

/**
 * Get detailed browser information
 */
export function getBrowserInfo(): {
	name: string;
	isVanadium: boolean;
	isChrome: boolean;
	isGrapheneOS: boolean;
} {
	const userAgent = navigator.userAgent;
	const vanadium = isVanadium();
	const chrome = userAgent.includes('Chrome') && !vanadium;

	let browserName = 'Unknown';
	if (vanadium) {
		browserName = 'Vanadium';
	} else if (chrome) {
		browserName = 'Chrome';
	} else if (userAgent.includes('Firefox')) {
		browserName = 'Firefox';
	} else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
		browserName = 'Safari';
	}

	return {
		name: browserName,
		isVanadium: vanadium,
		isChrome: chrome,
		isGrapheneOS: isGrapheneOS()
	};
}

/**
 * Get environment info for debugging
 */
export function getEnvironmentInfo(): {
	isPWA: boolean;
	isAndroid: boolean;
	isMobile: boolean;
	isVanadium: boolean;
	isGrapheneOS: boolean;
	isStockAndroidChrome: boolean;
	browserName: string;
	userAgent: string;
} {
	const browserInfo = getBrowserInfo();

	return {
		isPWA: isPWA(),
		isAndroid: isAndroid(),
		isMobile: isMobile(),
		isVanadium: browserInfo.isVanadium,
		isGrapheneOS: browserInfo.isGrapheneOS,
		isStockAndroidChrome: isStockAndroidChrome(),
		browserName: browserInfo.name,
		userAgent: navigator.userAgent
	};
}

/**
 * Check if camera permission is already granted
 */
export async function isCameraPermissionGranted(): Promise<boolean> {
	if (!navigator.permissions) {
		// Fallback for browsers that don't support permissions API
		return false;
	}

	try {
		const result = await navigator.permissions.query({
			name: 'camera' as PermissionName
		});
		return result.state === 'granted';
	} catch (error) {
		console.warn('Could not check camera permission status:', error);
		return false;
	}
}

/**
 * Request camera permission with user-friendly messaging
 */
export async function requestCameraPermission(): Promise<boolean> {
	try {
		// Request camera access
		const stream = await navigator.mediaDevices.getUserMedia({
			video: {
				facingMode: 'environment', // Prefer back camera on mobile
				width: { ideal: 1280 },
				height: { ideal: 720 }
			}
		});

		// Stop the stream immediately after getting permission
		stream.getTracks().forEach((track) => track.stop());

		console.log('Camera permission granted');
		return true;
	} catch (error) {
		console.error('Camera permission denied:', error);

		// Provide user-friendly error messages
		if (error instanceof DOMException) {
			switch (error.name) {
				case 'NotAllowedError':
					throw new Error(
						'Camera access was denied. Please allow camera access in your browser settings to scan QR codes.'
					);
				case 'NotFoundError':
					throw new Error('No camera found on your device.');
				case 'NotReadableError':
					throw new Error('Camera is already in use by another application.');
				case 'OverconstrainedError':
					throw new Error('Camera does not meet the required specifications.');
				default:
					throw new Error('Failed to access camera. Please check your browser settings.');
			}
		}

		throw new Error('Failed to access camera. Please try again.');
	}
}

/**
 * Check if the device supports camera access
 */
export function isCameraSupported(): boolean {
	return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

/**
 * Get detailed permission diagnostics for GrapheneOS/Vanadium
 */
export async function getVanadiumPermissionDiagnostics(): Promise<{
	permissionAPI: boolean;
	mediaDevices: boolean;
	getUserMedia: boolean;
	enumerateDevices: boolean;
	securityContext: string;
	userAgent: string;
	permissionState: string;
	lastAttemptError: string | null;
}> {
	const env = getEnvironmentInfo();

	let permissionState = 'unknown';
	let lastAttemptError: string | null = null;

	// Check permission API availability
	const hasPermissionAPI = !!navigator.permissions;

	if (hasPermissionAPI) {
		try {
			const result = await navigator.permissions.query({
				name: 'camera' as PermissionName
			});
			permissionState = result.state;
		} catch (error) {
			permissionState = 'query-failed';
			lastAttemptError = error instanceof Error ? error.message : 'Permission query failed';
		}
	}

	// Test getUserMedia availability
	let getUserMediaWorks = false;
	if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
		try {
			// Quick test without actually requesting permission
			getUserMediaWorks = true;
		} catch (error) {
			lastAttemptError = error instanceof Error ? error.message : 'getUserMedia unavailable';
		}
	}

	// Test enumerateDevices
	let enumerateDevicesWorks = false;
	if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
		try {
			await navigator.mediaDevices.enumerateDevices();
			enumerateDevicesWorks = true;
		} catch (error) {
			console.log('enumerateDevices failed:', error);
		}
	}

	// Determine security context
	let securityContext = 'unknown';
	if (location.protocol === 'https:') {
		securityContext = 'secure';
	} else if (location.protocol === 'http:' && location.hostname === 'localhost') {
		securityContext = 'localhost';
	} else {
		securityContext = 'insecure';
	}

	return {
		permissionAPI: hasPermissionAPI,
		mediaDevices: !!navigator.mediaDevices,
		getUserMedia: getUserMediaWorks,
		enumerateDevices: enumerateDevicesWorks,
		securityContext,
		userAgent: navigator.userAgent,
		permissionState,
		lastAttemptError
	};
}

/**
 * Get camera permission status with detailed information
 */
export async function getCameraPermissionStatus(): Promise<{
	granted: boolean;
	supported: boolean;
	canRequest: boolean;
	state: string;
	vanadiumDiagnostics?: any;
}> {
	const supported = isCameraSupported();
	const env = getEnvironmentInfo();

	if (!supported) {
		return {
			granted: false,
			supported: false,
			canRequest: false,
			state: 'not-supported'
		};
	}

	const granted = await isCameraPermissionGranted();

	// Get the actual permission state from the Permissions API
	let state = 'unknown';
	if (navigator.permissions) {
		try {
			const result = await navigator.permissions.query({
				name: 'camera' as PermissionName
			});
			state = result.state;
		} catch (error) {
			console.warn('Could not query camera permission state:', error);
			// Fallback: infer state from granted status
			state = granted ? 'granted' : 'prompt';
		}
	} else {
		// Fallback for browsers without Permissions API
		state = granted ? 'granted' : 'prompt';
	}

	const result: any = {
		granted,
		supported: true,
		canRequest: !granted,
		state
	};

	// Add detailed diagnostics for Vanadium/GrapheneOS
	if (env.isVanadium || env.isGrapheneOS) {
		try {
			result.vanadiumDiagnostics = await getVanadiumPermissionDiagnostics();
		} catch (error) {
			console.warn('Failed to get Vanadium diagnostics:', error);
		}
	}

	return result;
}

/**
 * Check if permission is permanently denied (requires manual reset)
 */
export async function isPermissionPermanentlyDenied(): Promise<boolean> {
	const env = getEnvironmentInfo();

	if (!navigator.permissions) {
		return false; // Can't determine, assume not permanently denied
	}

	try {
		const result = await navigator.permissions.query({
			name: 'camera' as PermissionName
		});

		// Vanadium/GrapheneOS may have different permission persistence behavior
		if (env.isVanadium || env.isGrapheneOS) {
			// GrapheneOS is privacy-focused and may not persist denials as aggressively
			// Only consider it permanently denied if explicitly denied and in PWA mode
			if (result.state === 'denied' && env.isPWA) {
				console.log('Camera permission denied in Vanadium PWA - may require manual reset');
				return true;
			}
			// In regular browsing, Vanadium may allow re-prompting
			return false;
		}

		// Stock Android Chrome has specific permission caching behavior
		if (env.isStockAndroidChrome) {
			// In Chrome PWAs, "denied" usually means permanently denied
			if (result.state === 'denied' && env.isPWA) {
				console.log('Camera permission denied in Chrome PWA - manual reset required');
				return true;
			}

			// In regular Chrome browsing, denied can still often be reset by user action
			if (result.state === 'denied') {
				console.log('Camera permission denied in Chrome browser - may require manual reset');
				return true; // Chrome caches denials aggressively
			}
		}

		// In standard Android PWAs (non-Chrome specific), "denied" often means permanently denied
		if (result.state === 'denied' && env.isPWA && env.isAndroid) {
			console.log('Camera permission appears to be permanently denied in Android PWA');
			return true;
		}

		return result.state === 'denied';
	} catch (error) {
		console.warn('Could not check if permission is permanently denied:', error);
		return false;
	}
}

/**
 * Get manual permission reset instructions for the current environment
 */
export function getPermissionResetInstructions(): {
	title: string;
	steps: string[];
	canReset: boolean;
	additionalTips?: string[];
} {
	const env = getEnvironmentInfo();

	// Handle Vanadium browser (GrapheneOS) specifically
	if (env.isVanadium) {
		if (env.isPWA) {
			return {
				title: 'Reset Camera Permission in Vanadium PWA (GrapheneOS)',
				steps: [
					'1. Tap the menu button (⋮) in the top-right corner',
					'2. Select "Site settings" or "App info"',
					'3. Find "Permissions" section',
					'4. Tap "Camera" and select "Allow"',
					'5. Close and reopen this PWA completely',
					'6. Try scanning again',
					'\nAlternative Method:',
					'1. Open Vanadium browser (not this PWA)',
					"2. Navigate to this site's URL",
					'3. Go to Settings > Site Settings > Camera',
					'4. Find this app\'s domain and set to "Allow"',
					'5. Return to PWA and restart'
				],
				canReset: true,
				additionalTips: [
					'🔒 GrapheneOS Privacy: Camera permissions are more restrictive for security',
					'📱 PWA Limitation: Some PWAs cache permission denials more aggressively',
					'🔄 Complete Restart: Close PWA entirely and reopen from home screen',
					'⚡ Browser First: Grant permission in Vanadium browser before using PWA',
					'🛡️ Security Context: HTTPS is required for camera access',
					'📍 Site-Specific: Each domain requires individual permission grants'
				]
			};
		} else {
			return {
				title: 'Reset Camera Permission in Vanadium (GrapheneOS)',
				steps: [
					'1. Tap the lock icon in the address bar',
					'2. Look for "Camera" permission and tap it',
					'3. Select "Allow for this site"',
					'4. Refresh the page and try again',
					'\nAdvanced Method:',
					'1. Go to Vanadium Settings (⋮ menu)',
					'2. Select "Site Settings"',
					'3. Tap "Camera"',
					'4. Find this site in the list',
					'5. Change setting to "Allow"',
					'6. Return to site and refresh',
					'\nForce Reset Method:',
					'1. Settings > Site Settings > All sites',
					'2. Find and select this domain',
					'3. Tap "Reset & delete"',
					'4. Revisit site and grant permission when prompted'
				],
				canReset: true,
				additionalTips: [
					'🔒 GrapheneOS Security: Enhanced privacy controls require explicit permission grants',
					'🎯 Site-Specific: Permissions are granted per-site, not globally',
					'🔄 Fresh Start: Resetting site data can help with persistent denials',
					'⏱️ Timing: Grant permission immediately when the dialog appears',
					'🛡️ Privacy Mode: Some privacy settings may block camera access entirely',
					'📱 Hardware: Ensure no other apps are using the camera simultaneously'
				]
			};
		}
	}

	// Handle standard Chrome on Android
	if (env.isPWA && env.isAndroid) {
		return {
			title: 'Reset Camera Permission in Android Chrome PWA',
			steps: [
				'1. Tap the menu button (⋮) in the top-right corner',
				'2. Select "Site settings" or "Settings"',
				'3. Find "Camera" in the permissions list',
				'4. Tap "Camera" and select "Allow"',
				'5. Return to this app and try scanning again',
				'\nAlternatively:',
				'1. Open Chrome browser (not this app)',
				'2. Go to Settings > Site Settings > Camera',
				'3. Find this app in the blocked list',
				'4. Tap it and change to "Allow"'
			],
			canReset: true
		};
	} else if (env.isAndroid) {
		return {
			title: 'Reset Camera Permission in Android Chrome',
			steps: [
				'1. Tap the lock icon or "Not secure" in the address bar',
				'2. Tap "Camera" and select "Allow"',
				'3. Refresh the page and try again',
				"\nIf that doesn't work:",
				'1. Go to Chrome Settings > Site Settings > Camera',
				'2. Find this site and change it to "Allow"'
			],
			canReset: true
		};
	} else {
		return {
			title: 'Reset Camera Permission',
			steps: [
				'1. Click the lock icon in the address bar',
				'2. Set Camera permission to "Allow"',
				'3. Refresh the page and try again'
			],
			canReset: true
		};
	}
}

/**
 * Wait for user gesture before requesting permissions (required for Vanadium)
 */
async function waitForUserGesture(): Promise<void> {
	return new Promise((resolve) => {
		// For Vanadium, we need to ensure the permission request happens
		// within the context of a user gesture. Add a small delay to ensure
		// the click event has fully propagated.
		setTimeout(resolve, 100);
	});
}

/**
 * Try Vanadium-specific permission clearing strategies
 */
async function tryVanadiumPermissionReset(): Promise<void> {
	const env = getEnvironmentInfo();

	if (!env.isVanadium) return;

	console.log('Attempting Vanadium permission cache reset strategies');

	// Strategy 1: Try to clear any cached permissions by requesting different constraints
	try {
		console.log('Vanadium reset: Requesting with different constraints to clear cache');
		const stream = await navigator.mediaDevices.getUserMedia({
			video: {
				width: { exact: 320 },
				height: { exact: 240 },
				frameRate: { ideal: 15 }
			}
		});
		stream.getTracks().forEach((track) => track.stop());
		console.log('Vanadium reset strategy 1: Different constraints worked');
	} catch (error) {
		console.log('Vanadium reset strategy 1 failed:', error);
	}

	// Strategy 2: Try to trigger permission dialog with minimal constraints
	try {
		console.log('Vanadium reset: Minimal video request');
		const stream = await navigator.mediaDevices.getUserMedia({ video: {} });
		stream.getTracks().forEach((track) => track.stop());
		console.log('Vanadium reset strategy 2: Minimal constraints worked');
	} catch (error) {
		console.log('Vanadium reset strategy 2 failed:', error);
	}
}

/**
 * Try multiple strategies to request camera permission
 */
export async function tryAlternativePermissionStrategies(): Promise<boolean> {
	const env = getEnvironmentInfo();

	console.log('Trying alternative permission strategies for:', env);

	// For Vanadium/GrapheneOS, use privacy-aware strategies
	if (env.isVanadium || env.isGrapheneOS) {
		console.log('Using GrapheneOS/Vanadium-optimized permission strategies');

		// First, try to reset any cached denials
		await tryVanadiumPermissionReset();

		// Wait for user gesture context to be established
		await waitForUserGesture();

		// Strategy 1: Very basic constraints with explicit user gesture timing
		try {
			console.log('Vanadium Strategy 1: Basic constraints with user gesture');
			const stream = await navigator.mediaDevices.getUserMedia({
				video: { width: 640, height: 480 }
			});
			stream.getTracks().forEach((track) => track.stop());
			console.log('Vanadium Strategy 1 succeeded');
			return true;
		} catch (error) {
			console.log('Vanadium Strategy 1 failed:', error);
		}

		// Strategy 2: Try without any constraints but with explicit permission check
		try {
			console.log('Vanadium Strategy 2: No constraints with permission check');

			// Check if we can query permissions first
			if (navigator.permissions) {
				const permission = await navigator.permissions.query({
					name: 'camera' as PermissionName
				});
				console.log('Permission state before request:', permission.state);
			}

			const stream = await navigator.mediaDevices.getUserMedia({ video: true });
			stream.getTracks().forEach((track) => track.stop());
			console.log('Vanadium Strategy 2 succeeded');
			return true;
		} catch (error) {
			console.log('Vanadium Strategy 2 failed:', error);
		}

		// Strategy 3: Front camera with delay (may have different permissions)
		try {
			console.log('Vanadium Strategy 3: Front camera with delay');

			// Add delay for Vanadium's permission processing
			await new Promise((resolve) => setTimeout(resolve, 500));

			const stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: 'user', width: 480, height: 320 }
			});
			stream.getTracks().forEach((track) => track.stop());
			console.log('Vanadium Strategy 3 succeeded');
			return true;
		} catch (error) {
			console.log('Vanadium Strategy 3 failed:', error);
		}

		// Strategy 4: Try to force permission dialog with sequential requests
		try {
			console.log('Vanadium Strategy 4: Sequential permission requests');

			// Multiple rapid requests may trigger permission dialog
			for (let i = 0; i < 3; i++) {
				try {
					console.log(`Vanadium sequential request ${i + 1}`);
					const stream = await navigator.mediaDevices.getUserMedia({
						video: {
							width: { ideal: 640 },
							height: { ideal: 480 },
							facingMode: i % 2 === 0 ? 'environment' : 'user'
						}
					});
					stream.getTracks().forEach((track) => track.stop());
					console.log('Vanadium Strategy 4 succeeded on attempt:', i + 1);
					return true;
				} catch (error) {
					console.log(`Vanadium sequential request ${i + 1} failed:`, error);
					// Small delay between attempts
					await new Promise((resolve) => setTimeout(resolve, 200));
				}
			}
		} catch (error) {
			console.log('Vanadium Strategy 4 failed:', error);
		}

		console.log('All Vanadium strategies failed - manual permission reset likely required');
		return false;
	}

	// Standard strategies for other browsers
	// Strategy 1: Basic getUserMedia with minimal constraints
	try {
		console.log('Strategy 1: Basic getUserMedia');
		const stream = await navigator.mediaDevices.getUserMedia({ video: true });
		stream.getTracks().forEach((track) => track.stop());
		console.log('Strategy 1 succeeded');
		return true;
	} catch (error) {
		console.log('Strategy 1 failed:', error);
	}

	// Strategy 2: getUserMedia with different constraints
	try {
		console.log('Strategy 2: Different video constraints');
		const stream = await navigator.mediaDevices.getUserMedia({
			video: {
				width: { min: 320, ideal: 640, max: 1920 },
				height: { min: 240, ideal: 480, max: 1080 }
			}
		});
		stream.getTracks().forEach((track) => track.stop());
		console.log('Strategy 2 succeeded');
		return true;
	} catch (error) {
		console.log('Strategy 2 failed:', error);
	}

	// Strategy 3: Try front camera first
	try {
		console.log('Strategy 3: Front camera');
		const stream = await navigator.mediaDevices.getUserMedia({
			video: { facingMode: 'user' }
		});
		stream.getTracks().forEach((track) => track.stop());
		console.log('Strategy 3 succeeded');
		return true;
	} catch (error) {
		console.log('Strategy 3 failed:', error);
	}

	console.log('All alternative strategies failed');
	return false;
}

/**
 * Request camera permission with enhanced PWA support and retry strategies
 */
export async function requestCameraPermissionForPWA(): Promise<boolean> {
	const env = getEnvironmentInfo();

	console.log('Requesting camera permission for PWA:', env);

	// Check if permission is permanently denied first
	const isPermanentlyDenied = await isPermissionPermanentlyDenied();
	if (isPermanentlyDenied) {
		console.log('Permission is permanently denied, manual reset required');
		throw new Error('PERMISSION_PERMANENTLY_DENIED');
	}

	try {
		// For Vanadium/GrapheneOS, use enhanced permission flow
		if (env.isVanadium || env.isGrapheneOS) {
			console.log('Using Vanadium/GrapheneOS-specific permission flow');

			// Ensure user gesture context is preserved
			await waitForUserGesture();

			// Try different constraint sets for Vanadium
			const vanadiumStrategies = [
				// Strategy 1: Minimal constraints to avoid Vanadium restrictions
				{ video: { width: 480, height: 320 } },
				// Strategy 2: No constraints
				{ video: true },
				// Strategy 3: Explicit environment camera
				{ video: { facingMode: { ideal: 'environment' } } },
				// Strategy 4: Basic ideal constraints
				{ video: { width: { ideal: 640 }, height: { ideal: 480 } } }
			];

			for (let i = 0; i < vanadiumStrategies.length; i++) {
				try {
					console.log(`Vanadium permission attempt ${i + 1}:`, vanadiumStrategies[i]);

					const stream = await navigator.mediaDevices.getUserMedia(vanadiumStrategies[i]);
					stream.getTracks().forEach((track) => track.stop());

					console.log(`Vanadium permission granted on attempt ${i + 1}`);
					return true;
				} catch (error) {
					console.log(`Vanadium permission attempt ${i + 1} failed:`, error);

					// Add delay between attempts for Vanadium
					if (i < vanadiumStrategies.length - 1) {
						await new Promise((resolve) => setTimeout(resolve, 300));
					}
				}
			}

			console.log('All Vanadium permission attempts failed');
			throw new Error('Vanadium permission requests failed');
		} else if (env.isPWA && env.isAndroid) {
			// For standard Android PWAs, use direct getUserMedia to trigger native dialog
			console.log('Using Android PWA-specific permission flow');

			const stream = await navigator.mediaDevices.getUserMedia({
				video: {
					facingMode: 'environment',
					width: { ideal: 1280 },
					height: { ideal: 720 }
				}
			});

			// Stop the stream immediately after getting permission
			stream.getTracks().forEach((track) => track.stop());

			console.log('Android PWA camera permission granted');
			return true;
		} else {
			// Use standard flow for other environments
			return await requestCameraPermission();
		}
	} catch (error) {
		console.error('PWA camera permission request failed:', error);

		// If the standard request failed, try alternative strategies
		console.log('Trying alternative permission strategies...');
		const alternativeSuccess = await tryAlternativePermissionStrategies();

		if (alternativeSuccess) {
			return true;
		}

		throw error;
	}
}

/**
 * Enhanced PWA camera permission solution
 * Addresses known Chrome PWA camera permission issues
 */
export async function requestPWACameraPermission(): Promise<boolean> {
	const env = getEnvironmentInfo();

	console.log('Requesting PWA camera permission for environment:', env);

	// Check if we're in a PWA context
	if (!env.isPWA) {
		console.log('Not in PWA context, using standard permission request');
		return await requestCameraPermission();
	}

	// PWA-specific permission flow
	console.log('PWA context detected, using enhanced permission flow');

	// Strategy 1: Try direct getUserMedia first (works in some PWA contexts)
	try {
		console.log('PWA Strategy 1: Direct getUserMedia');
		const stream = await navigator.mediaDevices.getUserMedia({
			video: {
				facingMode: 'environment',
				width: { ideal: 1280 },
				height: { ideal: 720 }
			}
		});
		stream.getTracks().forEach((track) => track.stop());
		console.log('PWA Strategy 1 succeeded');
		return true;
	} catch (error) {
		console.log('PWA Strategy 1 failed:', error);
	}

	// Strategy 2: Try with minimal constraints
	try {
		console.log('PWA Strategy 2: Minimal constraints');
		const stream = await navigator.mediaDevices.getUserMedia({ video: true });
		stream.getTracks().forEach((track) => track.stop());
		console.log('PWA Strategy 2 succeeded');
		return true;
	} catch (error) {
		console.log('PWA Strategy 2 failed:', error);
	}

	// Strategy 3: Try with different camera facing modes
	try {
		console.log('PWA Strategy 3: Different camera modes');
		const facingModes = ['environment', 'user', undefined];

		for (const facingMode of facingModes) {
			try {
				const constraints = facingMode ? { video: { facingMode } } : { video: true };
				const stream = await navigator.mediaDevices.getUserMedia(constraints);
				stream.getTracks().forEach((track) => track.stop());
				console.log(`PWA Strategy 3 succeeded with facingMode: ${facingMode}`);
				return true;
			} catch (error) {
				console.log(`PWA Strategy 3 failed with facingMode: ${facingMode}:`, error);
			}
		}
	} catch (error) {
		console.log('PWA Strategy 3 failed:', error);
	}

	// Strategy 4: Try with explicit user gesture timing
	try {
		console.log('PWA Strategy 4: User gesture timing');

		// Ensure we're in a user gesture context
		await new Promise((resolve) => setTimeout(resolve, 100));

		const stream = await navigator.mediaDevices.getUserMedia({
			video: {
				width: { ideal: 640 },
				height: { ideal: 480 }
			}
		});
		stream.getTracks().forEach((track) => track.stop());
		console.log('PWA Strategy 4 succeeded');
		return true;
	} catch (error) {
		console.log('PWA Strategy 4 failed:', error);
	}

	// Strategy 5: Try with device enumeration first
	try {
		console.log('PWA Strategy 5: Device enumeration first');

		const devices = await navigator.mediaDevices.enumerateDevices();
		const videoDevices = devices.filter((device) => device.kind === 'videoinput');
		console.log('Available video devices:', videoDevices.length);

		if (videoDevices.length === 0) {
			throw new Error('No video devices found');
		}

		const stream = await navigator.mediaDevices.getUserMedia({ video: true });
		stream.getTracks().forEach((track) => track.stop());
		console.log('PWA Strategy 5 succeeded');
		return true;
	} catch (error) {
		console.log('PWA Strategy 5 failed:', error);
	}

	console.log('All PWA strategies failed');
	return false;
}

/**
 * Get stock Android Chrome specific troubleshooting guide
 */
export function getStockAndroidChromeTroubleshootingGuide(): {
	title: string;
	quickSteps: string[];
	detailedSteps: string[];
	pwaSteps: string[];
	commonIssues: Array<{ issue: string; solution: string }>;
} {
	return {
		title: 'Fix Camera Permission in Stock Android Chrome',
		quickSteps: [
			'1. Tap the lock icon (🔒) or "Site info" in Chrome\'s address bar',
			'2. Find "Camera" permission and tap it',
			'3. Select "Allow" for this site',
			'4. Refresh the page and try scanning again'
		],
		detailedSteps: [
			"1. Open Chrome browser (not this app if it's a PWA)",
			'2. Navigate to this website',
			'3. Tap the three dots (⋮) menu in the top-right corner',
			'4. Select "Settings"',
			'5. Tap "Site Settings"',
			'6. Find and tap "Camera"',
			'7. Look for this website in the "Blocked" list',
			'8. Tap this website and change to "Allow"',
			'9. Return to this page and try again'
		],
		pwaSteps: [
			"If you're using this as an installed app (PWA):",
			'1. First grant permission in regular Chrome browser',
			'2. Open Chrome and visit this website',
			'3. Grant camera permission when prompted',
			'4. Return to the installed app and try again',
			'5. If still not working, uninstall and reinstall the app'
		],
		commonIssues: [
			{
				issue: 'Permission dialog never appears',
				solution: 'The permission was already denied. Follow the detailed steps above to reset it.'
			},
			{
				issue: 'App says "permission denied" immediately',
				solution:
					'Chrome cached the denial. Go to Chrome Settings > Site Settings > Camera and allow this site.'
			},
			{
				issue: 'Works in Chrome browser but not in PWA',
				solution: 'Grant permission in Chrome browser first, then try the PWA again.'
			},
			{
				issue: 'Still blocked after following steps',
				solution:
					'Clear Chrome data: Settings > Apps > Chrome > Storage > Clear Data, then try again.'
			}
		]
	};
}

/**
 * Get comprehensive PWA camera troubleshooting guide
 */
export function getPWACameraTroubleshootingGuide(): {
	title: string;
	steps: string[];
	chromeSteps: string[];
	androidSteps: string[];
	iosSteps: string[];
	commonIssues: Array<{ issue: string; solution: string }>;
} {
	return {
		title: 'PWA Camera Permission Troubleshooting',
		steps: [
			"1. Ensure you're using HTTPS (required for camera access)",
			'2. Try accessing the site in the regular browser first',
			'3. Grant camera permission in the browser',
			'4. Then install/use the PWA',
			'5. If still not working, follow the browser-specific steps below'
		],
		chromeSteps: [
			'1. Open Chrome browser (not the PWA)',
			"2. Navigate to this site's URL",
			'3. Tap the lock icon in the address bar',
			'4. Find "Camera" permission and tap it',
			'5. Select "Allow for this site"',
			'6. Return to the PWA and try again',
			"7. If that doesn't work:",
			'   - Go to Chrome Settings (⋮ menu)',
			'   - Select "Site Settings"',
			'   - Tap "Camera"',
			'   - Find this site in the list',
			'   - Change setting to "Allow"',
			'   - Go to "All sites" and find this domain',
			'   - Tap "Reset & delete" to clear all site data',
			'   - Revisit the site and grant permission when prompted'
		],
		androidSteps: [
			'1. Open Chrome browser (not the PWA)',
			"2. Navigate to this site's URL",
			'3. Tap the three dots (⋮) in the top-right corner',
			'4. Select "Settings"',
			'5. Tap "Site Settings"',
			'6. Find "Camera" and tap it',
			'7. Look for this site in the blocked list',
			'8. Tap it and change to "Allow"',
			'9. Return to the PWA and try again',
			'10. If still not working:',
			'    - Go to Android Settings > Apps',
			'    - Find Chrome and tap it',
			'    - Tap "Permissions"',
			'    - Ensure "Camera" is allowed',
			"    - Clear Chrome's data and cache",
			'    - Revisit the site and grant permission'
		],
		iosSteps: [
			'1. Open Safari browser (not the PWA)',
			"2. Navigate to this site's URL",
			'3. Tap the "Aa" icon in the address bar',
			'4. Select "Website Settings"',
			'5. Find "Camera" and set to "Ask" or "Allow"',
			'6. Refresh the page and try again',
			'7. If using Chrome on iOS:',
			'   - Open Chrome browser',
			'   - Navigate to this site',
			'   - Tap "Allow" when prompted for camera access',
			'   - Return to the PWA and try again'
		],
		commonIssues: [
			{
				issue: 'Permission dialog never appears in PWA',
				solution:
					'Access the site in the regular browser first, grant permission there, then use the PWA'
			},
			{
				issue: 'Camera works in browser but not PWA',
				solution:
					'This is a known Chrome PWA limitation. Grant permission in the browser first, then restart the PWA'
			},
			{
				issue: 'Permission denied immediately',
				solution: 'Check if camera is being used by another app, then try again'
			},
			{
				issue: 'PWA shows "permission denied"',
				solution: 'Reset site data in browser settings and grant permission in browser first'
			},
			{
				issue: 'Camera access works on some sites but not others',
				solution:
					'Each domain requires individual permission grants. Grant permission for this specific site'
			}
		]
	};
}

/**
 * Enhanced camera permission request with PWA awareness
 */
export async function requestEnhancedCameraPermission(): Promise<boolean> {
	const env = getEnvironmentInfo();

	console.log('Requesting enhanced camera permission for:', env);

	// Check if permission is already granted
	const status = await getCameraPermissionStatus();
	if (status.granted) {
		console.log('Camera permission already granted');
		return true;
	}

	// Use PWA-specific strategies if in PWA context
	if (env.isPWA) {
		console.log('Using PWA-specific permission strategies');
		const success = await requestPWACameraPermission();

		if (success) {
			return true;
		}

		// If PWA strategies failed, provide detailed guidance
		const troubleshooting = getPWACameraTroubleshootingGuide();
		console.log('PWA camera permission failed. Troubleshooting guide:', troubleshooting);

		throw new Error(
			'Camera permission failed in PWA. Please follow the troubleshooting steps provided.'
		);
	}

	// For non-PWA contexts, use standard strategies
	return await requestCameraPermission();
}

/**
 * Enhanced camera permission request for GrapheneOS Chrome
 */
export async function requestGrapheneOSChromePermission(): Promise<boolean> {
	const env = getEnvironmentInfo();

	if (!env.isGrapheneOS) {
		throw new Error('This function is only for GrapheneOS');
	}

	console.log('Requesting camera permission for GrapheneOS Chrome');

	// Strategy 1: Try with explicit HTTPS check
	try {
		console.log('GrapheneOS Strategy 1: HTTPS verification');
		if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
			throw new Error('HTTPS required for camera access in GrapheneOS');
		}

		const stream = await navigator.mediaDevices.getUserMedia({
			video: {
				width: { min: 320, ideal: 640 },
				height: { min: 240, ideal: 480 }
			}
		});
		stream.getTracks().forEach((track) => track.stop());
		console.log('GrapheneOS Strategy 1 succeeded');
		return true;
	} catch (error) {
		console.log('GrapheneOS Strategy 1 failed:', error);
	}

	// Strategy 2: Try with minimal constraints
	try {
		console.log('GrapheneOS Strategy 2: Minimal constraints');
		const stream = await navigator.mediaDevices.getUserMedia({ video: true });
		stream.getTracks().forEach((track) => track.stop());
		console.log('GrapheneOS Strategy 2 succeeded');
		return true;
	} catch (error) {
		console.log('GrapheneOS Strategy 2 failed:', error);
	}

	// Strategy 3: Try with explicit user gesture timing
	try {
		console.log('GrapheneOS Strategy 3: User gesture timing');

		// Ensure we're in a user gesture context
		await new Promise((resolve) => setTimeout(resolve, 100));

		const stream = await navigator.mediaDevices.getUserMedia({
			video: { facingMode: 'environment' }
		});
		stream.getTracks().forEach((track) => track.stop());
		console.log('GrapheneOS Strategy 3 succeeded');
		return true;
	} catch (error) {
		console.log('GrapheneOS Strategy 3 failed:', error);
	}

	// Strategy 4: Try with different camera facing modes
	try {
		console.log('GrapheneOS Strategy 4: Different camera modes');

		const facingModes = ['environment', 'user', undefined];

		for (const facingMode of facingModes) {
			try {
				const constraints = facingMode ? { video: { facingMode } } : { video: true };
				const stream = await navigator.mediaDevices.getUserMedia(constraints);
				stream.getTracks().forEach((track) => track.stop());
				console.log(`GrapheneOS Strategy 4 succeeded with facingMode: ${facingMode}`);
				return true;
			} catch (error) {
				console.log(`GrapheneOS Strategy 4 failed with facingMode: ${facingMode}:`, error);
			}
		}
	} catch (error) {
		console.log('GrapheneOS Strategy 4 failed:', error);
	}

	// Strategy 5: Try with device enumeration first
	try {
		console.log('GrapheneOS Strategy 5: Device enumeration first');

		const devices = await navigator.mediaDevices.enumerateDevices();
		const videoDevices = devices.filter((device) => device.kind === 'videoinput');
		console.log('Available video devices:', videoDevices.length);

		if (videoDevices.length === 0) {
			throw new Error('No video devices found - GrapheneOS may be blocking camera access');
		}

		const stream = await navigator.mediaDevices.getUserMedia({ video: true });
		stream.getTracks().forEach((track) => track.stop());
		console.log('GrapheneOS Strategy 5 succeeded');
		return true;
	} catch (error) {
		console.log('GrapheneOS Strategy 5 failed:', error);
	}

	console.log('All GrapheneOS Chrome strategies failed');
	return false;
}

/**
 * Request camera permission with proper error handling and user guidance
 */
export async function ensureCameraPermission(): Promise<boolean> {
	const status = await getCameraPermissionStatus();

	if (!status.supported) {
		throw new Error('Camera is not supported on this device or browser.');
	}

	if (status.granted) {
		return true;
	}

	// Use PWA-aware permission request
	return await requestEnhancedCameraPermission();
}
