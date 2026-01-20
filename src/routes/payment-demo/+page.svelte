<script lang="ts">
	import { browser } from '$app/environment';

	import QRScanModal from '$lib/components/scanner/QRScanModal.svelte';
	import { useAccountDeployment } from '$lib/composables/useAccountDeployment';

	import type { StarknetReceiveData } from '$lib/services/client/lightning/types';
	import { WebauthnAccountService } from '$lib/services/client/webauthn-account.service';
	import { currentUser } from '$lib/stores/auth';
	import Footer from '$lib/ui/Footer.svelte';
	import type { BitcoinAddressData, LightningInvoiceData } from '$lib/utils/qr-parser';
	import { parseQRData, QRDataType } from '$lib/utils/qr-parser';
	import { onMount } from 'svelte';

	// Redirect non-logged-in users
	$: if (browser && !$currentUser) {
		window.location.href = '/';
	}

	// Redirect users without WebAuthn credentials
	$: if (browser && $currentUser && (!$currentUser.credentialId || !$currentUser.publicKey)) {
		window.location.href = '/';
	}

	type PaymentMethod = 'qr' | 'clipboard' | 'manual';

	let selectedMethod: PaymentMethod | null = null;
	let permissionStatus = 'Checking...';
	let showPermissionStatus = false;
	let showQRScanner = false;
	let scanResult: string = '';

	// Clipboard processing state
	let showClipboardProcessor = false;
	let clipboardContent = '';
	let clipboardError = '';
	let processingClipboard = false;
	let clipboardProcessingResult: any = null;
	let invalidClipboardBannerClosed = false;

	// Lightning invoice processing state

	// Account deployment state - only when user is authenticated and on client side
	let accountState: any = null;
	$: if (browser && $currentUser && $currentUser.credentialId && $currentUser.publicKey) {
		const { state } = useAccountDeployment($currentUser);
		accountState = state;
	}

	// Payment method options
	const paymentMethods = [
		{
			id: 'qr' as PaymentMethod,
			title: 'Scan a QR Code',
			description: 'Use your camera to scan a Starknet wallet QR code'
		},
		{
			id: 'clipboard' as PaymentMethod,
			title: 'Paste from clipboard',
			description: 'Paste a Starknet wallet address from your clipboard'
		},
		{
			id: 'manual' as PaymentMethod,
			title: 'Manual entry',
			description: 'Enter Starknet wallet details manually'
		}
	];

	async function handleMethodSelect(method: PaymentMethod) {
		selectedMethod = method;
		console.log('Selected payment method:', method);

		if (method === 'qr') {
			// Launch QR scanner modal instead of just checking permissions
			showQRScanner = true;
			showPermissionStatus = false;
			showClipboardProcessor = false;
		} else if (method === 'clipboard') {
			// Launch clipboard processor
			showClipboardProcessor = true;
			showQRScanner = false;
			showPermissionStatus = false;
			await handleClipboardPaste();
		} else if (method === 'manual') {
			// Redirect to /pay for manual entry
			window.location.href = '/pay';
		} else {
			showPermissionStatus = false;
			showQRScanner = false;
			showClipboardProcessor = false;
		}
	}

	function handleQRScannerClose() {
		showQRScanner = false;
		selectedMethod = null;
	}

	function handleLightningInvoice(data: LightningInvoiceData) {
		console.log('Lightning invoice scanned:', data);
		scanResult = `Lightning Invoice: ${data.invoice.substring(0, 50)}...`;
		showQRScanner = false;
		// Process the Lightning invoice just like clipboard does
		handleProcessLightningInvoice(data);
	}

	function handleBitcoinAddress(data: BitcoinAddressData) {
		console.log('Bitcoin address scanned:', data);
		showQRScanner = false;
		// If amount is provided in BIP-21, we can create the swap immediately.
		if (data.amount && data.amount > 0) {
			createStarknetToBitcoinSwapFromScan(data).catch((err) => {
				console.error('Starknet→Bitcoin swap creation failed:', err);
				scanResult = `Error creating swap: ${err instanceof Error ? err.message : 'Unknown error'}`;
			});
			return;
		}

		// Otherwise, open /pay in swap mode with the Bitcoin address locked
		try {
			const params = new URLSearchParams({
				swapMode: 'starknet_to_bitcoin',
				bitcoinAddress: data.address,
				from: 'qr'
			});
			if (typeof window !== 'undefined') {
				window.location.href = `/pay?${params.toString()}`;
			}
		} catch (e) {
			console.error('Redirect to /pay failed:', e);
		}
	}

	function handleStarknetInvoice(data: StarknetReceiveData) {
		console.log('Starknet invoice scanned:', data);
		// Close the scanner modal
		showQRScanner = false;

		// Redirect to /pay and prefill form via query params
		const params = new URLSearchParams({
			recipientAddress: data.recipientAddress,
			amount: String(data.amount), // sats
			network: data.network || 'Starknet',
			currency: 'WBTC',
			from: 'qr',
			autopay: '1'
		});
		if (typeof window !== 'undefined') {
			window.location.href = `/pay?${params.toString()}`;
		}
	}

	function handleQRScanError(error: string) {
		console.error('QR scan error:', error);
		scanResult = `Error: ${error}`;
		showQRScanner = false;
	}

	onMount(async () => {
		// Component mounted - ready for user interaction
		console.log('Payment demo page loaded');
	});

	function handleKeydown(event: KeyboardEvent, method: PaymentMethod) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			handleMethodSelect(method);
		}
	}

	function handleBackClick() {
		window.location.href = '/homebis';
	}

	// Clipboard processing functions
	async function handleClipboardPaste() {
		resetClipboardState();
		processingClipboard = true;

		try {
			// Check if clipboard API is supported
			if (!navigator.clipboard) {
				throw new Error('Clipboard API not supported in this browser');
			}

			// Read clipboard content
			const content = await navigator.clipboard.readText();

			if (!content || content.trim() === '') {
				clipboardError = 'Clipboard is empty';
				return;
			}

			clipboardContent = content.trim();
			await processClipboardContent(clipboardContent);
		} catch (error) {
			console.error('Clipboard access error:', error);
			if (error instanceof Error) {
				if (error.name === 'NotAllowedError') {
					clipboardError = 'Clipboard access denied. Please grant permission and try again.';
				} else {
					clipboardError = `Failed to access clipboard: ${error.message}`;
				}
			} else {
				clipboardError = 'Failed to access clipboard';
			}
		} finally {
			processingClipboard = false;
		}
	}

	// Create Starknet→Bitcoin swap from scanned BIP-21 / address
	async function createStarknetToBitcoinSwapFromScan(data: BitcoinAddressData) {
		try {
			// Resolve Starknet account address from multiple sources with on-demand calculation
			const accountAddress = await resolveStarknetAddress();
			if (!accountAddress) {
				throw new Error(
					'Starknet account address unavailable. Open Ops/Pay once to initialize context.'
				);
			}

			const body = {
				sourceAsset: 'WBTC',
				starknetAddress: accountAddress,
				bitcoinAddress: data.address,
				amountSats: data.amount // optional
			};

			const res = await fetch('/api/bitcoin/create-starknet-to-bitcoin', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			const payload = await res.json();
			if (!res.ok) {
				throw new Error(payload?.error || payload?.message || 'API error');
			}

			const swap = payload?.data;
			if (!swap?.swapId || !swap?.starknetAddress) {
				throw new Error('Invalid response from swap API');
			}

			scanResult = `Swap created: ${swap.swapId}. Send tokens to ${swap.starknetAddress.substring(0, 10)}...`;
		} catch (e) {
			throw e;
		}
	}

	async function resolveStarknetAddress(): Promise<string | null> {
		// 1) Already computed in deployment state
		const fromState = accountState?.accountStatus?.address;
		if (fromState && typeof fromState === 'string' && fromState.startsWith('0x')) {
			return fromState;
		}

		// 2) From current user profile
		const fromUser = $currentUser?.starknetAddress;
		if (fromUser && typeof fromUser === 'string' && fromUser.startsWith('0x')) {
			return fromUser;
		}

		// 3) Compute on-demand using WebauthnAccountService
		try {
			if ($currentUser) {
				const service = new WebauthnAccountService();
				const computed = await service.calculateAccountAddress($currentUser);
				return computed || null;
			}
		} catch (e) {
			console.error('Failed to compute Starknet address on-demand:', e);
		}

		return null;
	}

	async function processClipboardContent(content: string) {
		try {
			const parsed = await parseQRData(content);
			clipboardProcessingResult = parsed;

			if (!parsed.isValid) {
				clipboardError =
					parsed.error ||
					'The clipboard content cannot be processed. Please make sure it contains a valid Lightning invoice, Bitcoin address/URI (BIP-21), or Starknet invoice.';
				return;
			}

			// Process based on type
			if (parsed.type === QRDataType.LIGHTNING_INVOICE) {
				console.log('Lightning invoice detected:', parsed.parsedData);
				scanResult = `Lightning Invoice: ${parsed.parsedData.invoice.substring(0, 50)}...`;
				// Auto-process Lightning invoice immediately
				handleProcessLightningInvoice(parsed.parsedData);
			} else if (parsed.type === QRDataType.STARKNET_INVOICE) {
				console.log('Starknet invoice detected:', parsed.parsedData);
				scanResult = `Starknet Invoice: ${parsed.parsedData.recipientAddress?.substring(0, 20)}... (${parsed.parsedData.amount} sats)`;
			} else if (parsed.type === QRDataType.BITCOIN_ADDRESS) {
				console.log('Bitcoin address detected:', parsed.parsedData);
				scanResult = `Bitcoin Address: ${parsed.parsedData.address}`;
				// If clipboard content has amount (BIP-21), create swap; else open /pay in swap mode
				if (parsed.parsedData.amount && parsed.parsedData.amount > 0) {
					createStarknetToBitcoinSwapFromScan(parsed.parsedData).catch((err) => {
						console.error('Starknet→Bitcoin swap creation failed:', err);
						clipboardError = `Error creating swap: ${err instanceof Error ? err.message : 'Unknown error'}`;
					});
				} else {
					try {
						const params = new URLSearchParams({
							swapMode: 'starknet_to_bitcoin',
							bitcoinAddress: parsed.parsedData.address,
							from: 'clipboard'
						});
						if (typeof window !== 'undefined') {
							window.location.href = `/pay?${params.toString()}`;
						}
					} catch (e) {
						console.error('Redirect to /pay failed:', e);
					}
				}
			} else {
				clipboardError =
					'The clipboard content is not a supported format. Please provide a Lightning invoice, Bitcoin BIP-21 URI/address, or Starknet invoice.';
			}
		} catch (e) {
			console.error('Clipboard processing failed:', e);
			clipboardError = 'Failed to process clipboard content';
		}
	}

	function resetClipboardState() {
		clipboardContent = '';
		clipboardError = '';
		clipboardProcessingResult = null;
		scanResult = '';
		invalidClipboardBannerClosed = false;
	}

	function closeInvalidClipboardBanner() {
		invalidClipboardBannerClosed = true;
	}

	function handleClipboardClose() {
		showClipboardProcessor = false;
		selectedMethod = null;
		resetClipboardState();
	}

	// Lightning invoice processing handlers
	function handleProcessLightningInvoice(invoiceData: LightningInvoiceData) {
		// Extract Lightning invoice data and redirect to /pay page
		const params = new URLSearchParams();

		// Add the Lightning invoice as the address (recipient)
		params.set('recipientAddress', invoiceData.invoice);

		// Handle BOLT11 Lightning invoice data
		console.log('🔍 Processing BOLT11 invoice:', {
			type: invoiceData.type,
			hasDecoded: !!invoiceData.decoded,
			amountSats: invoiceData.decoded?.amountSats,
			description: invoiceData.decoded?.description,
			isValid: invoiceData.decoded?.isValid
		});

		if (invoiceData.type === 'bolt11' && invoiceData.decoded) {
			// Add amount if available from decoded BOLT11 invoice
			if (invoiceData.decoded.amountSats && invoiceData.decoded.amountSats > 0) {
				params.set('amount', String(invoiceData.decoded.amountSats));
				console.log('✅ Added amount parameter:', invoiceData.decoded.amountSats);
			} else {
				console.log('❌ No amount in BOLT11 invoice');
			}

			// Add description if available (let URLSearchParams handle encoding)
			if (invoiceData.decoded.description) {
				params.set('description', invoiceData.decoded.description);
				console.log('✅ Added description parameter');
			} else {
				console.log('❌ No description in BOLT11 invoice');
			}
		} else {
			console.log('❌ Not a BOLT11 invoice or no decoded data');
		}

		// Add origin marker for UI tweaks and enable autopay when possible
		params.set('from', 'clipboard');
		params.set('autopay', '1');

		// Redirect to /pay page with the Lightning invoice data
		if (typeof window !== 'undefined') {
			const finalUrl = `/pay?${params.toString()}`;
			console.log('🔗 Redirecting to:', finalUrl);
			console.log('📋 All parameters:', Object.fromEntries(params.entries()));
			window.location.href = finalUrl;
		}
	}

	function handleProcessBitcoinAddress(bitcoinData: BitcoinAddressData) {
		createStarknetToBitcoinSwapFromScan(bitcoinData)
			.then(() => {
				showClipboardProcessor = false;
			})
			.catch((err) => {
				console.error('Bitcoin address processing error:', err);
				clipboardError = `Error: ${err instanceof Error ? err.message : 'Failed to process Bitcoin address'}`;
			});
	}
</script>

<svelte:head>
	<title>Payment Method Demo - BIM</title>
	<meta name="description" content="Demo of the Figma-inspired payment method selector" />
</svelte:head>

<main class="about-bim">
	<div class="selector-header">
		<button class="back-button" aria-label="Go back" on:click={handleBackClick}>←</button>
		<h2 class="selector-title">Choose your payment method</h2>
	</div>

	<!-- Invalid Clipboard Banner -->
	{#if clipboardError && !invalidClipboardBannerClosed}
		<div class="invalid-clipboard-banner" role="alert">
			Invalid clipboard.
			<button class="close-banner" aria-label="Close" on:click={closeInvalidClipboardBanner}>
				×
			</button>
		</div>
	{/if}

	<div class="component-demo">
		<div class="figma-payment-selector">
			<div class="payment-methods">
				{#each paymentMethods as method}
					<button
						class="payment-method"
						class:selected={selectedMethod === method.id}
						on:click={() => handleMethodSelect(method.id)}
						on:keydown={(e) => handleKeydown(e, method.id)}
						aria-pressed={selectedMethod === method.id}
						role="option"
					>
						<div class="method-content">
							<span class="method-title">{method.title}</span>
						</div>
						<div class="method-indicator" aria-hidden="true">
							{#if selectedMethod === method.id}
								✓
							{:else}
								○
							{/if}
						</div>
					</button>
				{/each}
			</div>

			{#if showPermissionStatus}
				<div class="permission-status">
					<h3>Camera Permission Status</h3>
					<p
						class="permission-message"
						class:granted={permissionStatus.includes('granted')}
						class:denied={permissionStatus.includes('denied')}
					>
						{permissionStatus}
					</p>
				</div>
			{/if}

			{#if scanResult}
				<div class="scan-result">
					<h3>Scan Result</h3>
					<p class="scan-result-text">{scanResult}</p>
				</div>
			{/if}

			{#if showClipboardProcessor && !clipboardError}
				<div class="clipboard-processor">
					<h3>Clipboard Processing</h3>

					{#if processingClipboard}
						<div class="processing-status">
							<p>Accessing clipboard...</p>
						</div>
					{:else if clipboardProcessingResult && clipboardProcessingResult.isValid}
						<div class="clipboard-success">
							<p class="success-message">
								{#if clipboardProcessingResult.type === QRDataType.LIGHTNING_INVOICE}
									⚡ Lightning Invoice Detected
								{:else if clipboardProcessingResult.type === QRDataType.STARKNET_INVOICE}
									🔷 Starknet Invoice Detected
								{:else if clipboardProcessingResult.type === QRDataType.BITCOIN_ADDRESS}
									₿ Bitcoin Address Detected
								{/if}
							</p>

							<div class="invoice-preview">
								<h4>Invoice Preview:</h4>
								<p class="invoice-content">
									{clipboardContent.substring(0, 100)}...
								</p>
							</div>

							<div class="processing-actions">
								{#if clipboardProcessingResult.type === QRDataType.LIGHTNING_INVOICE}
									<div class="lightning-processor">
										<h4>⚡ Lightning Invoice Ready</h4>
										<p>Process this Lightning invoice to create a payment swap.</p>
										<button
											class="process-button lightning-process"
											on:click={() =>
												handleProcessLightningInvoice(clipboardProcessingResult.parsedData)}
										>
											Process Lightning Invoice
										</button>
									</div>
								{:else if clipboardProcessingResult.type === QRDataType.STARKNET_INVOICE}
									<div class="starknet-placeholder">
										<h4>Starknet Invoice Processing</h4>
										<p>This is where Starknet invoice processing would happen.</p>
										<button class="process-button" disabled>
											Process Starknet Invoice (Coming Soon)
										</button>
									</div>
								{:else if clipboardProcessingResult.type === QRDataType.BITCOIN_ADDRESS}
									<div class="bitcoin-processor">
										<h4>₿ Bitcoin Address Ready</h4>
										<p>Create a Starknet→Bitcoin on-chain swap using this address.</p>
										<button
											class="process-button"
											on:click={() =>
												handleProcessBitcoinAddress(clipboardProcessingResult.parsedData)}
										>
											Process Bitcoin Address
										</button>
									</div>
								{/if}

								<button class="back-button-secondary" on:click={handleClipboardClose}>
									Go Back
								</button>
							</div>
						</div>
					{/if}
				</div>
			{/if}

			<div class="selector-footer"></div>
		</div>
	</div>
</main>

<Footer />

<!-- QR Scanner Modal -->
<QRScanModal
	isOpen={showQRScanner}
	onClose={handleQRScannerClose}
	onLightningInvoice={handleLightningInvoice}
	onBitcoinAddress={handleBitcoinAddress}
	onStarknetInvoice={handleStarknetInvoice}
	onError={handleQRScanError}
/>

<!-- Lightning Invoice Processor Modal -->

<style>
	/* Full screen container that doesn't affect global body/html */
	.about-bim {
		width: 100%;
		height: 100vh;
		margin: 0;
		padding: 0;
		background: var(--color-background, #121413);
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: space-between;
		overflow: hidden;
	}

	.component-demo {
		width: 100%;
		max-width: 430px;
		margin: 0 auto;
		background: var(--color-background, #121413);
		border-radius: 28px;
		overflow: hidden;
		margin-top: 2rem;
		flex: 1;
		max-height: calc(100vh - 200px);
		overflow-y: hidden; /* Prevent scrolling */
	}

	.figma-payment-selector {
		display: flex;
		flex-direction: column;
		height: 100%;
		justify-content: flex-start;
	}

	.selector-header {
		display: flex;
		align-items: center;
		gap: var(--space-md, 1rem);
		padding: var(--space-lg, 2rem) var(--space-md, 1rem) var(--space-md, 1rem);
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		background: var(--color-background, #121413);
		position: sticky;
		top: 0;
		z-index: 10;
		width: 100%;
	}

	.back-button {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		background: transparent;
		border: none;
		color: var(--color-text, #ffffff);
		font-size: 1.5rem;
		border-radius: var(--radius-md, 8px);
		cursor: pointer;
		transition: background var(--transition-fast, 0.15s);
	}

	.back-button:hover {
		background: rgba(255, 255, 255, 0.1);
	}

	.back-button:focus {
		outline: 2px solid var(--color-primary, #f69413);
		outline-offset: 2px;
	}

	.selector-title {
		flex: 1;
		font-size: 1.375rem;
		font-weight: 300;
		color: var(--color-primary, #f69413);
		margin: 0;
		text-align: center;
		margin-right: 40px; /* Balance the back button */
		font-family: 'Roboto', sans-serif;
	}

	.payment-methods {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		flex: 1;
		justify-content: flex-start;
		gap: 2.5rem;
		padding: var(--space-lg, 2rem) var(--space-md, 1rem);
		min-height: 0; /* Allow flex shrinking */
	}

	.payment-method {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-lg, 2rem) var(--space-md, 1rem);
		background: #2a2a2a;
		border: 2px solid transparent;
		border-radius: 15px;
		cursor: pointer;
		transition: all var(--transition-base, 0.3s);
		min-height: 105px;
		position: relative;
		overflow: hidden;
	}

	.payment-method:hover {
		background: #333333;
		transform: translateY(-2px);
	}

	.payment-method:focus {
		outline: none;
		border: 2px solid #f69413;
	}

	.payment-method.selected {
		border: 2px solid #f69413;
		background: #2a2a2a;
	}

	.payment-method.selected::before {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(135deg, rgba(246, 148, 19, 0.1) 0%, rgba(246, 148, 19, 0.05) 100%);
		pointer-events: none;
	}

	.method-content {
		display: flex;
		align-items: center;
		gap: var(--space-md, 1rem);
		flex: 1;
	}

	.method-title {
		font-size: 1.375rem;
		font-weight: 400;
		color: var(--color-text, #ffffff);
	}

	.method-indicator {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 35px;
		height: 35px;
		border-radius: 50%;
		font-size: 1.25rem;
		font-weight: bold;
		transition: all var(--transition-fast, 0.15s);
	}

	.payment-method.selected .method-indicator {
		background: var(--color-primary, #f69413);
		color: #ffffff;
	}

	.payment-method:not(.selected) .method-indicator {
		color: rgba(255, 255, 255, 0.4);
		border: 2px solid rgba(255, 255, 255, 0.2);
	}

	/* Ensure no method is visually selected by default */
	.payment-method {
		border: 2px solid transparent;
	}

	.permission-status {
		padding: var(--space-lg, 2rem) var(--space-md, 1rem);
		border-top: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(0, 0, 0, 0.2);
	}

	.permission-status h3 {
		color: var(--color-primary, #f69413);
		font-size: 1.125rem;
		font-weight: 500;
		margin: 0 0 var(--space-sm, 0.5rem) 0;
	}

	.permission-message {
		color: var(--color-text, #ffffff);
		font-size: 0.95rem;
		margin: 0;
		padding: var(--space-sm, 0.5rem) var(--space-md, 1rem);
		border-radius: var(--radius-md, 8px);
		background: rgba(255, 255, 255, 0.05);
		border-left: 4px solid rgba(255, 255, 255, 0.3);
		transition: all var(--transition-fast, 0.15s);
	}

	.permission-message.granted {
		color: #4ade80;
		background: rgba(74, 222, 128, 0.1);
		border-left-color: #4ade80;
	}

	.permission-message.denied {
		color: #f87171;
		background: rgba(248, 113, 113, 0.1);
		border-left-color: #f87171;
	}

	.scan-result {
		padding: var(--space-lg, 2rem) var(--space-md, 1rem);
		border-top: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(74, 222, 128, 0.1);
	}

	.scan-result h3 {
		color: #4ade80;
		font-size: 1.125rem;
		font-weight: 500;
		margin: 0 0 var(--space-sm, 0.5rem) 0;
	}

	.scan-result-text {
		color: var(--color-text, #ffffff);
		font-size: 0.95rem;
		margin: 0;
		padding: var(--space-sm, 0.5rem) var(--space-md, 1rem);
		border-radius: var(--radius-md, 8px);
		background: rgba(255, 255, 255, 0.05);
		border-left: 4px solid #4ade80;
		font-family: monospace;
		word-break: break-all;
	}

	/* Clipboard processor styles */
	.clipboard-processor {
		padding: var(--space-lg, 2rem) var(--space-md, 1rem);
		border-top: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(0, 0, 0, 0.2);
	}

	.clipboard-processor h3 {
		color: var(--color-primary, #f69413);
		font-size: 1.125rem;
		font-weight: 500;
		margin: 0 0 var(--space-md, 1rem) 0;
	}

	.processing-status {
		text-align: center;
		padding: var(--space-lg, 2rem);
	}

	.processing-status p {
		color: var(--color-text, #ffffff);
		font-size: 1rem;
		margin: 0;
		opacity: 0.8;
	}

	/* Invalid Clipboard Banner */
	.invalid-clipboard-banner {
		background: #3a1f1f;
		color: #ffb3b3;
		border: 1px solid #7a2b2b;
		border-radius: 0;
		padding: 8px 12px;
		margin: 0;
		text-align: center;
		font-size: 0.9rem;
		font-weight: 500;
		position: relative;
		width: 100%;
	}

	.invalid-clipboard-banner .close-banner {
		position: absolute;
		top: 4px;
		right: 16px;
		background: none;
		border: none;
		font-size: 16px;
		color: #ffb3b3;
		cursor: pointer;
		padding: 0;
		line-height: 1;
	}

	.clipboard-success {
		padding: var(--space-md, 1rem);
	}

	.success-message {
		color: #4ade80;
		font-size: 1.1rem;
		font-weight: 500;
		margin: 0 0 var(--space-md, 1rem) 0;
		text-align: center;
	}

	.invoice-preview {
		margin: var(--space-md, 1rem) 0;
		padding: var(--space-md, 1rem);
		background: rgba(255, 255, 255, 0.05);
		border-radius: var(--radius-md, 8px);
	}

	.invoice-preview h4 {
		color: var(--color-text, #ffffff);
		font-size: 0.9rem;
		font-weight: 500;
		margin: 0 0 var(--space-sm, 0.5rem) 0;
	}

	.invoice-content {
		color: rgba(255, 255, 255, 0.8);
		font-size: 0.85rem;
		font-family: monospace;
		margin: 0;
		word-break: break-all;
		line-height: 1.3;
	}

	.processing-actions {
		margin-top: var(--space-lg, 2rem);
	}

	.lightning-processor,
	.starknet-placeholder {
		margin: var(--space-md, 1rem) 0;
		padding: var(--space-md, 1rem);
		border-radius: var(--radius-md, 8px);
		text-align: center;
	}

	.lightning-processor {
		background: rgba(246, 148, 19, 0.1);
		border: 1px solid rgba(246, 148, 19, 0.3);
	}

	.starknet-placeholder {
		background: rgba(74, 222, 128, 0.1);
		border: 1px solid rgba(74, 222, 128, 0.3);
	}

	.lightning-processor h4,
	.starknet-placeholder h4 {
		margin: 0 0 var(--space-sm, 0.5rem) 0;
		font-size: 1rem;
		font-weight: 500;
	}

	.lightning-processor h4 {
		color: var(--color-primary, #f69413);
	}

	.starknet-placeholder h4 {
		color: #4ade80;
	}

	.lightning-processor p,
	.starknet-placeholder p {
		color: rgba(255, 255, 255, 0.8);
		font-size: 0.9rem;
		margin: 0 0 var(--space-md, 1rem) 0;
	}

	.process-button {
		padding: var(--space-sm, 0.5rem) var(--space-md, 1rem);
		border-radius: var(--radius-md, 8px);
		font-size: 0.9rem;
		margin-bottom: var(--space-md, 1rem);
		border: none;
		cursor: pointer;
		transition: all var(--transition-fast, 0.15s);
	}

	.process-button:disabled {
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		color: rgba(255, 255, 255, 0.6);
		cursor: not-allowed;
	}

	.process-button.lightning-process {
		background: var(--color-primary, #f69413);
		color: #ffffff;
		font-weight: 500;
	}

	.process-button.lightning-process:hover {
		background: #e6850b;
		transform: translateY(-1px);
	}

	.back-button-secondary {
		background: transparent;
		border: 2px solid var(--color-primary, #f69413);
		color: var(--color-primary, #f69413);
		padding: var(--space-sm, 0.5rem) var(--space-lg, 2rem);
		border-radius: var(--radius-md, 8px);
		font-size: 0.95rem;
		font-weight: 500;
		cursor: pointer;
		transition: all var(--transition-fast, 0.15s);
	}

	.back-button-secondary:hover {
		background: rgba(246, 148, 19, 0.1);
		transform: translateY(-1px);
	}

	.back-button-secondary:focus {
		outline: none;
		box-shadow: 0 0 0 3px rgba(246, 148, 19, 0.3);
	}

	.selector-footer {
		padding: var(--space-lg, 2rem) var(--space-md, 1rem);
	}

	/* Modal overlay styles */
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.8);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 1rem;
	}

	.modal-content {
		background: var(--color-background, #121413);
		border-radius: 16px;
		max-width: 90vw;
		max-height: 90vh;
		overflow-y: auto;
		box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
	}

	/* Mobile optimizations */
	@media (max-width: 767px) {
		.component-demo {
			margin: 0;
			border-radius: 0;
			margin-top: 0.5rem;
		}

		.selector-header {
			padding: var(--space-md, 1rem) var(--space-sm, 0.5rem) var(--space-sm, 0.5rem);
		}

		.selector-title {
			font-size: 1.25rem;
		}

		.payment-methods {
			padding: var(--space-md, 1rem) var(--space-sm, 0.5rem);
			gap: var(--space-sm, 0.5rem);
		}

		.payment-method {
			padding: var(--space-md, 1rem);
			min-height: 80px;
		}

		.method-title {
			font-size: 1.125rem;
		}

		.method-indicator {
			width: 30px;
			height: 30px;
			font-size: 1rem;
		}

		.permission-status {
			padding: var(--space-md, 1rem) var(--space-sm, 0.5rem);
		}

		.permission-status h3 {
			font-size: 1rem;
		}

		.permission-message {
			font-size: 0.875rem;
			padding: var(--space-sm, 0.5rem);
		}

		.clipboard-processor {
			padding: var(--space-md, 1rem) var(--space-sm, 0.5rem);
		}

		.clipboard-processor h3 {
			font-size: 1rem;
		}

		.invoice-preview {
			padding: var(--space-sm, 0.5rem);
		}

		.lightning-processor,
		.starknet-placeholder {
			padding: var(--space-sm, 0.5rem);
		}

		.back-button-secondary {
			padding: var(--space-sm, 0.5rem) var(--space-md, 1rem);
			font-size: 0.875rem;
		}
	}

	/* High contrast mode support */
	@media (prefers-contrast: high) {
		.payment-method {
			border-width: 3px;
		}

		.payment-method.selected {
			border-color: var(--color-primary, #f69413);
			background: rgba(246, 148, 19, 0.2);
		}
	}

	/* Reduced motion support */
	@media (prefers-reduced-motion: reduce) {
		.payment-method {
			transition: none;
		}

		.payment-method:hover {
			transform: none;
		}
	}

	/* Touch device optimizations */
	@media (hover: none) and (pointer: coarse) {
		.payment-method {
			min-height: 88px; /* Larger touch target */
		}

		.payment-method:hover {
			transform: none; /* Remove hover effects on touch */
			background: #2a2a2a;
		}
	}
</style>
