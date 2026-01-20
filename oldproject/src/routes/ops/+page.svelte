<!--
  @component
  Operations Page - BIM Lightning Network Operations
  
  This page contains all the Lightning Network operations and functionality
  for authenticated users. It includes:
  
  - QR code scanning functionality
  - Account deployment interface
  - Lightning Network swap functionality
  - Camera testing utilities
  
  @requires $lib/stores/auth - User authentication state management
  @requires $lib/components/account/AccountDeployment - Account deployment interface
  @requires $lib/components/lightning/StarknetToLightning - Lightning swap interface
  @requires $lib/components/ui/Card - UI card component
  
  @author bim
  @version 1.0.0
-->

<script lang="ts">
	import AccountDeployment from '$lib/components/account/AccountDeployment.svelte';
	import StarknetToLightning from '$lib/components/lightning/StarknetToLightning.svelte';
	import QRScanModal from '$lib/components/scanner/QRScanModal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import type { StarknetReceiveData } from '$lib/services/client/lightning/types';
	import { currentUser } from '$lib/stores/auth';
	import type { BitcoinAddressData, LightningInvoiceData } from '$lib/utils/qr-parser';
	import { onMount } from 'svelte';

	let showQRScanner = false;

	onMount(() => {
		// No permission requests on initial load
		// Camera permissions will be handled contextually when user tries to scan QR codes
	});

	function openQRScanner() {
		console.log('Opening QR scanner modal...');
		showQRScanner = true;
		console.log('QR scanner modal state:', showQRScanner);
	}

	function closeQRScanner() {
		console.log('Closing QR scanner modal...');
		showQRScanner = false;
		console.log('QR scanner modal state:', showQRScanner);
	}

	function handleLightningInvoice(data: LightningInvoiceData) {
		console.log('Lightning invoice scanned:', data);
		closeQRScanner();
	}

	function handleBitcoinAddress(data: BitcoinAddressData) {
		console.log('Bitcoin address scanned:', data);
		closeQRScanner();
	}

	function handleStarknetInvoice(data: StarknetReceiveData) {
		console.log('Starknet invoice scanned:', data);
		// Handle Starknet invoice if needed
		closeQRScanner();
	}

	function handleScanError(error: string) {
		console.error('QR scan error:', error);
		// Don't close modal for non-critical errors
		if (
			!error.includes('permission') &&
			!error.includes('camera') &&
			!error.includes('initialization')
		) {
			closeQRScanner();
		}
	}
</script>

<svelte:head>
	<title>BIM Operations - Lightning Network</title>
	<meta name="description" content="Lightning Network operations and Bitcoin swap functionality" />
</svelte:head>

<main>
	<div class="authenticated-content">
		<h1>BIM Operations</h1>
		<p>Your Lightning Network swap app is ready!</p>

		<!-- QR Scan Button -->
		<div class="qr-scan-section">
			<Button on:click={openQRScanner} variant="primary">📷 Scan QR Code</Button>
			<p class="scan-help">Scan a Lightning invoice or Bitcoin address</p>

			<!-- Camera Test Link -->
			<div class="camera-test-link">
				<a href="/camera-test" class="test-link">🔧 Test Camera Permissions</a>
				<p class="test-help">Having camera issues? Test permissions here</p>
			</div>
		</div>

		<!-- Account Deployment & Lightning Receive -->
		<div class="lightning-operations">
			<AccountDeployment user={$currentUser} />
		</div>

		<!-- Lightning Send Component -->
		<div class="lightning-operations">
			<h3>⚡ Send to Lightning Network</h3>
			<StarknetToLightning
				starknetAddress={$currentUser.starknetAddress || ''}
				onSwapComplete={(swap) => {
					console.log('Swap completed:', swap);
				}}
				onError={(error) => {
					console.error('Swap error:', error);
				}}
			/>
		</div>
	</div>
</main>

<!-- QR Scanner Modal -->
{#if showQRScanner}
	<QRScanModal
		isOpen={showQRScanner}
		onClose={closeQRScanner}
		onLightningInvoice={handleLightningInvoice}
		onBitcoinAddress={handleBitcoinAddress}
		onStarknetInvoice={handleStarknetInvoice}
		onError={handleScanError}
	/>
{/if}

<style>
	.authenticated-content {
		padding: 2rem;
		text-align: center;
	}
	.authenticated-content h1 {
		margin-bottom: 1rem;
		color: var(--color-text, #333);
	}
	.authenticated-content p {
		color: var(--color-text-light, #666);
	}
	.qr-scan-section {
		margin: 2rem 0;
		padding: 1rem;
		background: var(--color-background-light, #f9f9f9);
		border-radius: 8px;
		border: 1px solid var(--color-border, #e0e0e0);
	}
	.scan-help {
		margin-top: 0.5rem;
		font-size: 0.9rem;
		color: var(--color-text-light, #666);
	}
	.camera-test-link {
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid var(--color-border, #e0e0e0);
	}
	.test-link {
		display: inline-block;
		padding: 0.5rem 1rem;
		background: #6c757d;
		color: white;
		text-decoration: none;
		border-radius: 4px;
		font-size: 0.9rem;
		transition: background-color 0.2s ease;
	}
	.test-link:hover {
		background: #545b62;
	}
	.test-help {
		margin-top: 0.5rem;
		font-size: 0.8rem;
		color: var(--color-text-light, #666);
	}
	.lightning-operations {
		margin: 2rem 0;
		padding: 1.5rem;
		background: var(--color-background-light, #f9f9f9);
		border-radius: 12px;
		border: 1px solid var(--color-border, #e0e0e0);
	}
	.lightning-operations h3 {
		margin-bottom: 1rem;
		color: var(--color-text, #333);
		text-align: center;
	}
</style>
