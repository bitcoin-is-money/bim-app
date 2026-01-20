<!--
  @component
  Camera Test Page
  
  A dedicated page for testing camera permissions in PWA environments.
  Helps debug camera access issues across different browsers and platforms.
  
  @author bim
  @version 1.0.0
-->

<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import {
		getCameraPermissionStatus,
		getEnvironmentInfo,
		getPWACameraTroubleshootingGuide,
		getPermissionResetInstructions,
		requestEnhancedCameraPermission,
		getGrapheneOSChromeTroubleshootingGuide,
		requestGrapheneOSChromePermission
	} from '$lib/utils/camera-permission';
	import { onMount } from 'svelte';

	// Test state
	let envInfo: any = null;
	let permissionStatus: any = null;
	let testResults: string[] = [];
	let isLoading = false;
	let showTroubleshooting = false;
	let troubleshootingGuide: any = null;

	/**
	 * Initialize test environment
	 */
	async function initializeTest() {
		try {
			isLoading = true;
			testResults = [];

			// Get environment info
			envInfo = getEnvironmentInfo();
			testResults.push(`Environment: ${JSON.stringify(envInfo, null, 2)}`);

			// Get permission status
			permissionStatus = await getCameraPermissionStatus();
			testResults.push(`Permission Status: ${JSON.stringify(permissionStatus, null, 2)}`);

			// Get appropriate troubleshooting guide
			if (envInfo.isGrapheneOS && !envInfo.isPWA) {
				troubleshootingGuide = getGrapheneOSChromeTroubleshootingGuide();
			} else if (envInfo.isPWA) {
				troubleshootingGuide = getPWACameraTroubleshootingGuide();
			} else {
				troubleshootingGuide = getPermissionResetInstructions();
			}
		} catch (error) {
			testResults.push(`Test initialization failed: ${error}`);
		} finally {
			isLoading = false;
		}
	}

	/**
	 * Test camera permission request
	 */
	async function testCameraPermission() {
		try {
			isLoading = true;
			testResults.push('Testing camera permission request...');

			const success = await requestEnhancedCameraPermission();

			if (success) {
				testResults.push('✅ Camera permission request succeeded!');
			} else {
				testResults.push('❌ Camera permission request failed');
			}
		} catch (error) {
			testResults.push(`❌ Camera permission test failed: ${error}`);
		} finally {
			isLoading = false;
		}
	}

	/**
	 * Test GrapheneOS-specific camera permission
	 */
	async function testGrapheneOSPermission() {
		try {
			isLoading = true;
			testResults.push('Testing GrapheneOS-specific camera permission...');

			const success = await requestGrapheneOSChromePermission();

			if (success) {
				testResults.push('✅ GrapheneOS camera permission request succeeded!');
			} else {
				testResults.push('❌ GrapheneOS camera permission request failed');
			}
		} catch (error) {
			testResults.push(`❌ GrapheneOS camera permission test failed: ${error}`);
		} finally {
			isLoading = false;
		}
	}

	/**
	 * Test basic camera access
	 */
	async function testBasicCamera() {
		try {
			isLoading = true;
			testResults.push('Testing basic camera access...');

			if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
				testResults.push('❌ getUserMedia not supported');
				return;
			}

			const stream = await navigator.mediaDevices.getUserMedia({ video: true });
			stream.getTracks().forEach((track) => track.stop());
			testResults.push('✅ Basic camera access works!');
		} catch (error) {
			testResults.push(`❌ Basic camera access failed: ${error}`);
		} finally {
			isLoading = false;
		}
	}

	/**
	 * Test permission API
	 */
	async function testPermissionAPI() {
		try {
			isLoading = true;
			testResults.push('Testing permission API...');

			if (!navigator.permissions) {
				testResults.push('❌ Permissions API not supported');
				return;
			}

			const result = await navigator.permissions.query({
				name: 'camera' as PermissionName
			});
			testResults.push(`✅ Permission API works. State: ${result.state}`);
		} catch (error) {
			testResults.push(`❌ Permission API failed: ${error}`);
		} finally {
			isLoading = false;
		}
	}

	/**
	 * Clear test results
	 */
	function clearResults() {
		testResults = [];
	}

	// Initialize on mount
	onMount(() => {
		initializeTest();
	});
</script>

<svelte:head>
	<title>Camera Test - BIM</title>
	<meta name="description" content="Test camera permissions for PWA" />
</svelte:head>

<main class="camera-test-page">
	<div class="container">
		<h1>📷 Camera Permission Test</h1>
		<p>This page helps debug camera permission issues in PWA environments.</p>

		{#if isLoading}
			<div class="loading">Loading test information...</div>
		{/if}

		{#if envInfo}
			<div class="test-section">
				<h2>Environment Information</h2>
				<div class="info-grid">
					<div class="info-item">
						<strong>Browser:</strong>
						{envInfo.browserName}
					</div>
					<div class="info-item">
						<strong>PWA:</strong>
						{envInfo.isPWA ? 'Yes' : 'No'}
					</div>
					<div class="info-item">
						<strong>Android:</strong>
						{envInfo.isAndroid ? 'Yes' : 'No'}
					</div>
					<div class="info-item">
						<strong>Mobile:</strong>
						{envInfo.isMobile ? 'Yes' : 'No'}
					</div>
					<div class="info-item">
						<strong>Vanadium:</strong>
						{envInfo.isVanadium ? 'Yes' : 'No'}
					</div>
					<div class="info-item">
						<strong>GrapheneOS:</strong>
						{envInfo.isGrapheneOS ? 'Yes' : 'No'}
					</div>
				</div>
			</div>
		{/if}

		{#if permissionStatus}
			<div class="test-section">
				<h2>Permission Status</h2>
				<div class="info-grid">
					<div class="info-item">
						<strong>Supported:</strong>
						{permissionStatus.supported ? 'Yes' : 'No'}
					</div>
					<div class="info-item">
						<strong>Granted:</strong>
						{permissionStatus.granted ? 'Yes' : 'No'}
					</div>
					<div class="info-item">
						<strong>Can Request:</strong>
						{permissionStatus.canRequest ? 'Yes' : 'No'}
					</div>
					<div class="info-item">
						<strong>State:</strong>
						{permissionStatus.state}
					</div>
				</div>
			</div>
		{/if}

		<div class="test-section">
			<h2>Test Actions</h2>
			<div class="button-grid">
				<Button on:click={testBasicCamera} variant="primary">Test Basic Camera</Button>
				<Button on:click={testPermissionAPI} variant="primary">Test Permission API</Button>
				<Button on:click={testCameraPermission} variant="primary">Test Enhanced Permission</Button>
				<Button on:click={testGrapheneOSPermission} variant="primary">
					Test GrapheneOS Permission
				</Button>
				<Button on:click={clearResults} variant="secondary">Clear Results</Button>
			</div>
		</div>

		{#if testResults.length > 0}
			<div class="test-section">
				<h2>Test Results</h2>
				<div class="results-container">
					{#each testResults as result}
						<div class="result-item">{result}</div>
					{/each}
				</div>
			</div>
		{/if}

		{#if troubleshootingGuide}
			<div class="test-section">
				<h2>Troubleshooting Guide</h2>
				<Button on:click={() => (showTroubleshooting = !showTroubleshooting)} variant="secondary">
					{showTroubleshooting ? 'Hide' : 'Show'} Troubleshooting Steps
				</Button>

				{#if showTroubleshooting}
					<div class="troubleshooting-content">
						<h3>{troubleshootingGuide.title}</h3>

						{#if troubleshootingGuide.steps}
							<h4>General Steps:</h4>
							<ol>
								{#each troubleshootingGuide.steps as step}
									<li>{step}</li>
								{/each}
							</ol>
						{/if}

						{#if troubleshootingGuide.chromeSteps}
							<h4>Chrome Steps:</h4>
							<ol>
								{#each troubleshootingGuide.chromeSteps as step}
									<li>{step}</li>
								{/each}
							</ol>
						{/if}

						{#if troubleshootingGuide.androidSteps}
							<h4>Android Steps:</h4>
							<ol>
								{#each troubleshootingGuide.androidSteps as step}
									<li>{step}</li>
								{/each}
							</ol>
						{/if}

						{#if troubleshootingGuide.iosSteps}
							<h4>iOS Steps:</h4>
							<ol>
								{#each troubleshootingGuide.iosSteps as step}
									<li>{step}</li>
								{/each}
							</ol>
						{/if}

						{#if troubleshootingGuide.privacySettings}
							<h4>GrapheneOS Privacy Settings:</h4>
							<ol>
								{#each troubleshootingGuide.privacySettings as step}
									<li>{step}</li>
								{/each}
							</ol>
						{/if}

						{#if troubleshootingGuide.commonIssues}
							<h4>Common Issues:</h4>
							<ul>
								{#each troubleshootingGuide.commonIssues as issue}
									<li>
										<strong>{issue.issue}:</strong>
										{issue.solution}
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				{/if}
			</div>
		{/if}

		<div class="test-section">
			<h2>Quick Actions</h2>
			<div class="button-grid">
				<a href="/" class="button secondary">← Back to Main App</a>
				<a href="/" class="button primary">Test QR Scanner (Main App)</a>
			</div>
		</div>
	</div>
</main>

<style>
	.camera-test-page {
		padding: 2rem;
		max-width: 800px;
		margin: 0 auto;
	}

	.container {
		background: white;
		border-radius: 12px;
		padding: 2rem;
		box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
	}

	h1 {
		color: #333;
		margin-bottom: 1rem;
		text-align: center;
	}

	.test-section {
		margin: 2rem 0;
		padding: 1.5rem;
		background: #f8f9fa;
		border-radius: 8px;
		border: 1px solid #e9ecef;
	}

	.test-section h2 {
		margin: 0 0 1rem 0;
		color: #333;
		border-bottom: 2px solid #007bff;
		padding-bottom: 0.5rem;
	}

	.info-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1rem;
	}

	.info-item {
		background: white;
		padding: 1rem;
		border-radius: 6px;
		border: 1px solid #dee2e6;
	}

	.button-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: 1rem;
		margin-top: 1rem;
	}

	.results-container {
		background: white;
		border: 1px solid #dee2e6;
		border-radius: 6px;
		padding: 1rem;
		max-height: 400px;
		overflow-y: auto;
		font-family: monospace;
		font-size: 0.9rem;
	}

	.result-item {
		margin-bottom: 0.5rem;
		padding: 0.5rem;
		border-bottom: 1px solid #f1f3f4;
	}

	.result-item:last-child {
		border-bottom: none;
	}

	.troubleshooting-content {
		margin-top: 1rem;
		background: white;
		border: 1px solid #dee2e6;
		border-radius: 6px;
		padding: 1.5rem;
	}

	.troubleshooting-content h3 {
		margin: 0 0 1rem 0;
		color: #333;
	}

	.troubleshooting-content h4 {
		margin: 1.5rem 0 0.5rem 0;
		color: #495057;
	}

	.troubleshooting-content ol,
	.troubleshooting-content ul {
		margin: 0.5rem 0;
		padding-left: 1.5rem;
	}

	.troubleshooting-content li {
		margin-bottom: 0.5rem;
	}

	.loading {
		text-align: center;
		padding: 2rem;
		color: #666;
		font-style: italic;
	}

	.button {
		display: inline-block;
		padding: 0.75rem 1.5rem;
		border-radius: 6px;
		text-decoration: none;
		font-weight: 500;
		text-align: center;
		cursor: pointer;
		border: none;
		transition: all 0.2s ease;
	}

	.button.primary {
		background: #007bff;
		color: white;
	}

	.button.primary:hover {
		background: #0056b3;
	}

	.button.secondary {
		background: #6c757d;
		color: white;
	}

	.button.secondary:hover {
		background: #545b62;
	}
</style>
