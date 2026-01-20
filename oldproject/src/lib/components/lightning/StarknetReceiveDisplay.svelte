<!--
  @component
  Starknet Receive Display Component
  
  This component handles the display of Starknet receive information including QR codes,
  JSON payload, and recipient details for receiving Bitcoin from Starknet network.
  
  @prop receiveData - Starknet receive data containing recipient, amount, and network
  @prop onCopy - Callback when copy to clipboard is triggered
  
  @author bim
  @version 1.0.0
-->

<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import QRCode from '$lib/components/ui/QRCode.svelte';
	import type { StarknetReceiveData } from '$lib/services/client/lightning/types';
	import { testStarknetInvoiceFormat, parseStarknetInvoice } from '$lib/utils/qr-parser';
	import { copyToClipboard } from '$lib/utils/payment-utils';

	// Component props
	export let receiveData: StarknetReceiveData;
	export let onCopy: (text: string) => void = () => {};

	// Copy feedback state
	let copySuccess = '';
	let copyError = '';
	let copyTimeout: NodeJS.Timeout;

	/**
	 * Format amount for display
	 */
	function formatAmount(amount: number): string {
		return new Intl.NumberFormat().format(amount);
	}

	/**
	 * Generate JSON string for QR code (compact format for better scanning)
	 */
	function getQRData(): string {
		// Validate data types before generating QR
		console.log('🎨 StarknetReceiveDisplay QR data generation - validation check:', {
			receiveData,
			recipientAddressType: typeof receiveData?.recipientAddress,
			amountType: typeof receiveData?.amount,
			networkType: typeof receiveData?.network,
			amountValue: receiveData?.amount,
			networkValue: receiveData?.network,
			isValidStructure:
				receiveData &&
				typeof receiveData === 'object' &&
				typeof receiveData.recipientAddress === 'string' &&
				typeof receiveData.amount === 'number' &&
				receiveData.network === 'Starknet',
			timestamp: new Date().toISOString()
		});

		// Additional validation before JSON.stringify
		if (!receiveData) {
			console.error('❌ receiveData is null or undefined');
			return '';
		}

		if (typeof receiveData.recipientAddress !== 'string') {
			console.error('❌ recipientAddress is not a string:', {
				value: receiveData.recipientAddress,
				type: typeof receiveData.recipientAddress
			});
		}

		if (typeof receiveData.amount !== 'number') {
			console.error('❌ amount is not a number:', {
				value: receiveData.amount,
				type: typeof receiveData.amount
			});
		}

		if (receiveData.network !== 'Starknet') {
			console.error('❌ network is not "Starknet":', {
				value: receiveData.network,
				type: typeof receiveData.network
			});
		}

		const qrData = JSON.stringify(receiveData);
		console.log('🎨 StarknetReceiveDisplay QR data generated:', {
			rawData: receiveData,
			qrData,
			qrDataLength: qrData.length,
			timestamp: new Date().toISOString()
		});

		// Verify the JSON can be parsed back correctly
		try {
			const parsedBack = JSON.parse(qrData);
			console.log('✅ JSON round-trip validation successful:', {
				original: receiveData,
				parsedBack,
				matches: JSON.stringify(receiveData) === JSON.stringify(parsedBack)
			});
		} catch (parseError) {
			console.error('❌ JSON round-trip validation failed:', parseError);
		}

		return qrData;
	}

	/**
	 * Get formatted JSON for display (pretty format for human readability)
	 */
	function getFormattedJSON(): string {
		return JSON.stringify(receiveData, null, 2);
	}

	/**
	 * Copy JSON to clipboard
	 */
	function copyJSON() {
		const jsonString = JSON.stringify(receiveData);
		onCopy(jsonString);
	}

	/**
	 * Copy recipient address to clipboard
	 */
	function copyAddress() {
		onCopy(receiveData.recipientAddress);
	}

	/**
	 * Copy QR code data to clipboard with enhanced feedback
	 */
	async function copyQRData() {
		try {
			const success = await copyToClipboard(qrData);
			if (success) {
				showCopySuccess('QR data copied to clipboard!');
				onCopy(qrData); // Maintain backward compatibility
			} else {
				showCopyError('Failed to copy QR data');
			}
		} catch (error) {
			console.error('Error copying QR data:', error);
			showCopyError('Failed to copy QR data');
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

	/**
	 * Debug function to test QR code parsing
	 */
	function debugQRCode() {
		console.log('🔍 DEBUG: Testing QR code generation and parsing');
		console.log('Original receiveData:', receiveData);
		console.log('Generated QR data:', qrData);

		// Test parsing the generated QR data
		try {
			const parsed = JSON.parse(qrData);
			console.log('✅ Parsed back successfully:', parsed);
			console.log('Validation:', {
				hasRecipientAddress: typeof parsed.recipientAddress === 'string',
				hasAmount: typeof parsed.amount === 'number',
				hasNetwork: parsed.network === 'Starknet',
				allValid:
					typeof parsed.recipientAddress === 'string' &&
					typeof parsed.amount === 'number' &&
					parsed.network === 'Starknet'
			});

			// Show the exact structure
			console.log('🔍 Exact structure analysis:', {
				keys: Object.keys(parsed),
				keyTypes: Object.keys(parsed).map((key) => `${key}: ${typeof parsed[key]}`),
				recipientAddressValue: parsed.recipientAddress,
				amountValue: parsed.amount,
				networkValue: parsed.network,
				recipientAddressExists: 'recipientAddress' in parsed,
				amountExists: 'amount' in parsed,
				networkExists: 'network' in parsed
			});
		} catch (error) {
			console.error('❌ Failed to parse generated QR data:', error);
		}
	}

	/**
	 * Test the parsing function with the generated QR data
	 */
	function testParsing() {
		console.log('🧪 Testing parsing function with generated QR data');
		console.log('QR data to test:', qrData);

		try {
			const parseResult = parseStarknetInvoice(qrData);
			console.log('📊 Parse result:', parseResult);

			if (parseResult.isValid) {
				console.log('✅ Parsing successful!');
			} else {
				console.log('❌ Parsing failed:', parseResult.error);
			}
		} catch (error) {
			console.error('💥 Parsing function threw error:', error);
		}
	}

	/**
	 * Show the exact JSON structure that would be in the QR code
	 */
	function showQRJSON() {
		console.log('📋 QR Code JSON Structure Analysis:');
		console.log('1. Original receiveData:', receiveData);
		console.log('2. Generated qrData string:', qrData);
		console.log('3. qrData length:', qrData.length);
		console.log('4. qrData type:', typeof qrData);

		try {
			const parsed = JSON.parse(qrData);
			console.log('5. Parsed JSON object:', parsed);
			console.log('6. Object keys:', Object.keys(parsed));
			console.log(
				'7. Key types:',
				Object.keys(parsed).map((key) => `${key}: ${typeof parsed[key]}`)
			);
			console.log('8. recipientAddress exists:', 'recipientAddress' in parsed);
			console.log('9. amount exists:', 'amount' in parsed);
			console.log('10. network exists:', 'network' in parsed);

			// Check for any hidden characters or encoding issues
			console.log('11. Raw string analysis:', {
				startsWithBrace: qrData.startsWith('{'),
				endsWithBrace: qrData.endsWith('}'),
				containsRecipientAddress: qrData.includes('recipientAddress'),
				containsAmount: qrData.includes('amount'),
				containsNetwork: qrData.includes('network'),
				charCodes: qrData
					.split('')
					.map((char, i) => ({ char, code: char.charCodeAt(0), position: i }))
					.slice(0, 20)
			});
		} catch (error) {
			console.error('❌ Failed to parse qrData:', error);
		}
	}

	/**
	 * Test the exact data structure that would be generated
	 */
	function testExactStructure() {
		console.log('🧪 Testing exact data structure generation');

		// Create a test object with the same structure
		const testData = {
			recipientAddress:
				receiveData?.recipientAddress ||
				'0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
			amount: receiveData?.amount || 50000,
			network: 'Starknet' as const
		};

		console.log('Test data object:', testData);
		console.log('Test data types:', {
			recipientAddressType: typeof testData.recipientAddress,
			amountType: typeof testData.amount,
			networkType: typeof testData.network
		});

		// Test JSON serialization
		const testJson = JSON.stringify(testData);
		console.log('Test JSON:', testJson);

		// Test parsing back
		try {
			const parsed = JSON.parse(testJson);
			console.log('Parsed back:', parsed);
			console.log('Structure validation:', {
				hasRecipientAddress: typeof parsed.recipientAddress === 'string',
				hasAmount: typeof parsed.amount === 'number',
				hasNetwork: parsed.network === 'Starknet',
				allValid:
					typeof parsed.recipientAddress === 'string' &&
					typeof parsed.amount === 'number' &&
					parsed.network === 'Starknet'
			});
		} catch (error) {
			console.error('Failed to parse test JSON:', error);
		}
	}

	$: qrData = getQRData();
	$: formattedJSON = getFormattedJSON();

	// Debug reactive changes
	$: if (receiveData) {
		console.log('🔄 StarknetReceiveDisplay receiveData changed:', {
			receiveData,
			hasRecipientAddress: !!receiveData.recipientAddress,
			hasAmount: !!receiveData.amount,
			hasNetwork: !!receiveData.network,
			recipientAddressType: typeof receiveData.recipientAddress,
			amountType: typeof receiveData.amount,
			networkType: typeof receiveData.network,
			amount: receiveData.amount,
			timestamp: new Date().toISOString()
		});
	}

	// Debug QR data changes
	$: console.log('🎨 QR data reactive update:', {
		qrData: qrData ? qrData.substring(0, 100) + '...' : null,
		qrDataLength: qrData?.length,
		receiveDataAmount: receiveData?.amount,
		timestamp: new Date().toISOString()
	});
</script>

<div class="starknet-receive-display">
	<!-- Header -->
	<div class="receive-header">
		<h4>🌐 Receive from Starknet</h4>
		<div class="receive-summary">
			<p>
				<strong>{formatAmount(receiveData.amount)} sats</strong>
				to be received on
				<strong>{receiveData.network}</strong>
			</p>
			<p class="recipient">
				Recipient: {receiveData.recipientAddress.substring(
					0,
					10
				)}...{receiveData.recipientAddress.substring(receiveData.recipientAddress.length - 8)}
			</p>
		</div>
	</div>

	<!-- QR Code Display -->
	<div class="qr-display">
		<QRCode data={qrData} size={400} errorMessage="Failed to generate Starknet receive QR code" />
		<p class="qr-instruction">
			Scan this QR code to receive {formatAmount(receiveData.amount)} sats from the Starknet network
		</p>

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

	<!-- JSON Data Display -->
	<div class="data-info">
		<div class="data-section">
			<label for="json-data">JSON Data:</label>
			<textarea id="json-data" readonly value={formattedJSON} class="data-text"></textarea>
			<Button variant="secondary" size="small" on:click={copyJSON}>Copy JSON</Button>
		</div>

		<!-- Recipient Address -->
		<div class="data-section">
			<label for="recipient-address">Recipient Address:</label>
			<textarea
				id="recipient-address"
				readonly
				value={receiveData.recipientAddress}
				class="data-text"
			></textarea>
			<Button variant="secondary" size="small" on:click={copyAddress}>Copy Address</Button>
		</div>

		<!-- Amount Display -->
		<div class="data-section">
			<label>Amount:</label>
			<div class="amount-display">
				<span class="amount-value">{formatAmount(receiveData.amount)} sats</span>
				<span class="network-badge">{receiveData.network}</span>
			</div>
		</div>
	</div>

	<!-- Information Section -->
	<div class="info-section">
		<div class="info-item">
			<span class="info-icon">ℹ️</span>
			<div class="info-content">
				<p>
					<strong>How to use:</strong>
					Share this QR code or JSON data with the sender on the Starknet network.
				</p>
				<p>
					The QR code contains your recipient address, the amount in satoshis, and specifies
					Starknet as the network.
				</p>
			</div>
		</div>
	</div>
</div>

<style>
	.starknet-receive-display {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		padding: 1rem;
		background: var(--color-surface, white);
		border-radius: 12px;
		border: 1px solid var(--color-border, #e0e0e0);
	}

	.receive-header {
		text-align: center;
	}

	.receive-header h4 {
		margin: 0 0 0.5rem 0;
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--color-text, #333);
	}

	.receive-summary p {
		margin: 0.25rem 0;
		font-size: 1rem;
		color: var(--color-text, #333);
	}

	.receive-summary .recipient {
		font-size: 0.875rem;
		color: var(--color-text-secondary, #666);
		font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
	}

	.qr-display {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
	}

	.qr-instruction {
		margin: 0;
		text-align: center;
		font-size: 0.875rem;
		color: var(--color-text-secondary, #666);
		max-width: 300px;
		line-height: 1.4;
	}

	.share-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		margin-top: 0.5rem;
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

	.data-info {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.data-section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.data-section label {
		font-weight: 500;
		font-size: 0.875rem;
		color: var(--color-text-secondary, #666);
	}

	.data-text {
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

	.data-text:focus {
		outline: none;
		border-color: var(--color-primary, #0070f3);
	}

	.amount-display {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem;
		background: var(--color-surface-variant, #f9f9f9);
		border-radius: 6px;
		border: 1px solid var(--color-border, #ddd);
	}

	.amount-value {
		font-weight: 600;
		font-size: 1rem;
		color: var(--color-text, #333);
	}

	.network-badge {
		background: var(--color-primary, #0070f3);
		color: white;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		font-size: 0.75rem;
		font-weight: 500;
	}

	.info-section {
		background: var(--color-surface-variant, #f8f9fa);
		border-radius: 8px;
		padding: 1rem;
	}

	.info-item {
		display: flex;
		gap: 0.75rem;
		align-items: flex-start;
	}

	.info-icon {
		font-size: 1.25rem;
		flex-shrink: 0;
	}

	.info-content {
		flex: 1;
	}

	.info-content p {
		margin: 0 0 0.5rem 0;
		font-size: 0.875rem;
		line-height: 1.4;
		color: var(--color-text, #333);
	}

	.info-content p:last-child {
		margin-bottom: 0;
	}

	.info-content strong {
		color: var(--color-text, #333);
	}

	@media (max-width: 640px) {
		.starknet-receive-display {
			padding: 0.75rem;
			gap: 1rem;
		}

		.qr-display {
			gap: 0.75rem;
		}

		.data-text {
			min-height: 3rem;
			font-size: 0.7rem;
		}

		.info-section {
			padding: 0.75rem;
		}

		.info-item {
			gap: 0.5rem;
		}

		.amount-display {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.5rem;
		}
	}
</style>
