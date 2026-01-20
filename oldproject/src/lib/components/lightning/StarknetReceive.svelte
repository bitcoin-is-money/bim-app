<!--
  @component
  Starknet Receive Component - Main Orchestrator
  
  This component provides the main interface for generating QR codes to receive
  Bitcoin from the Starknet network. It handles user input, validation, and
  coordinates with the display component.
  
  @prop starknetAddress - User's Starknet address (recipient)
  @prop onSuccess - Callback when QR code is successfully generated
  @prop onError - Callback when error occurs
  
  @author bim
  @version 1.0.0
-->

<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import type { StarknetReceiveData } from '$lib/services/client/lightning/types';
	import StarknetReceiveDisplay from './StarknetReceiveDisplay.svelte';

	// Component props
	export let starknetAddress: string;
	export let onSuccess: (data: StarknetReceiveData) => void = () => {};
	export let onError: (error: string) => void = () => {};

	// Component state
	let isVisible = false;
	let amount = 0;
	let receiveData: StarknetReceiveData | null = null;
	let errorMessage = '';
	let isGenerating = false;

	// Copy to clipboard functionality
	let copySuccess = '';
	let copyTimeout: NodeJS.Timeout;

	/**
	 * Validate input amount
	 */
	function validateAmount(): string | null {
		const numAmount = Number(amount);

		if (!numAmount || numAmount <= 0) {
			return 'Please enter a valid amount';
		}

		if (numAmount > 100000000) {
			// 1 BTC in sats
			return 'Maximum amount is 100,000,000 sats (1 BTC)';
		}

		return null;
	}

	/**
	 * Validate Starknet address
	 */
	function validateAddress(): string | null {
		if (!starknetAddress) {
			return 'Starknet address is required';
		}

		if (!starknetAddress.startsWith('0x')) {
			return 'Invalid Starknet address format';
		}

		if (starknetAddress.length < 10) {
			return 'Starknet address too short';
		}

		return null;
	}

	/**
	 * Generate QR code data
	 */
	function generateReceiveData() {
		const amountError = validateAmount();
		const addressError = validateAddress();

		if (amountError) {
			errorMessage = amountError;
			onError(amountError);
			return;
		}

		if (addressError) {
			errorMessage = addressError;
			onError(addressError);
			return;
		}

		isGenerating = true;
		errorMessage = '';

		try {
			// Ensure amount is a proper number (HTML inputs can make it a string)
			const numericAmount = Number(amount);

			// Create the receive data object
			const data: StarknetReceiveData = {
				recipientAddress: starknetAddress,
				amount: numericAmount, // Ensure it's a number
				network: 'Starknet'
			};

			// Additional validation after creation
			console.log('🔍 Created receiveData object:', {
				data,
				recipientAddressType: typeof data.recipientAddress,
				amountType: typeof data.amount,
				networkType: typeof data.network,
				networkValue: data.network,
				isValidStructure:
					data &&
					typeof data === 'object' &&
					typeof data.recipientAddress === 'string' &&
					typeof data.amount === 'number' &&
					data.network === 'Starknet'
			});

			// Test JSON serialization
			try {
				const testJson = JSON.stringify(data);
				const testParsed = JSON.parse(testJson);
				console.log('✅ JSON round-trip test successful:', {
					original: data,
					serialized: testJson,
					parsed: testParsed,
					matches: JSON.stringify(data) === JSON.stringify(testParsed)
				});
			} catch (jsonError) {
				console.error('❌ JSON round-trip test failed:', jsonError);
			}

			receiveData = data;
			onSuccess(data);

			console.log('Starknet receive data generated:', {
				recipient: data.recipientAddress.substring(0, 10) + '...',
				amount: data.amount,
				amountType: typeof data.amount,
				network: data.network,
				inputAmount: amount,
				inputType: typeof amount
			});
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : 'Unknown error occurred';
			console.error('Starknet receive generation error:', error);
			errorMessage = `Failed to generate receive data: ${errorMsg}`;
			onError(errorMessage);
		} finally {
			isGenerating = false;
		}
	}

	/**
	 * Handle copy to clipboard
	 */
	function handleCopy(text: string) {
		if (navigator.clipboard && navigator.clipboard.writeText) {
			navigator.clipboard
				.writeText(text)
				.then(() => {
					showCopySuccess('Copied to clipboard!');
				})
				.catch(() => {
					// Fallback for older browsers
					fallbackCopy(text);
				});
		} else {
			fallbackCopy(text);
		}
	}

	/**
	 * Fallback copy method for older browsers
	 */
	function fallbackCopy(text: string) {
		const textArea = document.createElement('textarea');
		textArea.value = text;
		textArea.style.position = 'fixed';
		textArea.style.left = '-999999px';
		textArea.style.top = '-999999px';
		document.body.appendChild(textArea);
		textArea.focus();
		textArea.select();

		try {
			document.execCommand('copy');
			showCopySuccess('Copied to clipboard!');
		} catch (err) {
			showCopySuccess('Failed to copy');
			console.error('Fallback copy failed:', err);
		}

		document.body.removeChild(textArea);
	}

	/**
	 * Show copy success message
	 */
	function showCopySuccess(message: string) {
		copySuccess = message;
		clearTimeout(copyTimeout);
		copyTimeout = setTimeout(() => {
			copySuccess = '';
		}, 2000);
	}

	/**
	 * Reset component state
	 */
	function reset() {
		receiveData = null;
		errorMessage = '';
		copySuccess = '';
		amount = 0;
	}

	/**
	 * Toggle component visibility
	 */
	function toggleVisibility() {
		isVisible = !isVisible;
		if (!isVisible) {
			reset();
		}
	}

	/**
	 * Format amount with thousands separator
	 */
	function formatAmount(value: number): string {
		return new Intl.NumberFormat().format(value);
	}

	// Computed properties
	$: isValid = validateAmount() === null && validateAddress() === null;
	$: amountFormatted = amount > 0 ? formatAmount(amount) : '';

	// Reactive QR data generation - update QR when amount or address changes
	$: if (
		receiveData &&
		isValid &&
		(receiveData.amount !== Number(amount) || receiveData.recipientAddress !== starknetAddress)
	) {
		// Ensure amount is a proper number (HTML inputs can make it a string)
		const numericAmount = Number(amount);

		console.log('🔄 Updating QR data due to changes:', {
			oldAmount: receiveData.amount,
			oldAmountType: typeof receiveData.amount,
			newAmount: numericAmount,
			newAmountType: typeof numericAmount,
			rawInputAmount: amount,
			rawInputType: typeof amount,
			oldAddress: receiveData.recipientAddress?.substring(0, 10) + '...',
			newAddress: starknetAddress?.substring(0, 10) + '...',
			isValidNumber: !isNaN(numericAmount) && numericAmount > 0,
			timestamp: new Date().toISOString()
		});

		// Update receive data with new values - ensure amount is a number
		receiveData = {
			recipientAddress: starknetAddress,
			amount: numericAmount, // Convert to number explicitly
			network: 'Starknet'
		};

		// Notify parent of the update
		onSuccess(receiveData);
	}

	// Debug logging
	$: console.log('StarknetReceive validation:', {
		amount,
		amountAsNumber: Number(amount),
		starknetAddress,
		amountValid: validateAmount(),
		addressValid: validateAddress(),
		isValid
	});
</script>

<!-- Starknet Receive Toggle Button -->
<Button variant="success" on:click={toggleVisibility}>
	{isVisible ? 'Hide' : 'Receive from Starknet'}
</Button>

{#if isVisible}
	<Card>
		<div class="starknet-receive">
			<h3>Receive from Starknet</h3>
			<p class="description">
				Generate a QR code to receive Bitcoin from the Starknet network. Share this QR code with the
				sender to receive the specified amount.
			</p>

			{#if !receiveData}
				<!-- Initial Setup - Amount Input Section -->
				<div class="input-section">
					<div class="amount-input">
						<label for="amount">Amount to receive (in sats):</label>
						<div class="input-group">
							<input
								id="amount"
								type="number"
								bind:value={amount}
								placeholder="e.g., 50000"
								min="1"
								max="100000000"
								class="amount-field"
								class:error={validateAmount() !== null}
							/>
							<span class="input-suffix">sats</span>
						</div>
						{#if amountFormatted}
							<div class="amount-preview">
								{amountFormatted} satoshis
							</div>
						{/if}
						{#if validateAmount() && amount > 0}
							<div class="validation-error">
								{validateAmount()}
							</div>
						{/if}
					</div>

					<!-- Recipient Address Info -->
					<div class="address-info">
						<label>Recipient Address:</label>
						<div class="address-display">
							<code>
								{starknetAddress.substring(0, 20)}...{starknetAddress.substring(
									starknetAddress.length - 10
								)}
							</code>
						</div>
					</div>
				</div>

				<!-- Generate Button -->
				<div class="generate-section">
					<Button
						variant="primary"
						size="large"
						disabled={!isValid || isGenerating}
						on:click={generateReceiveData}
						fullWidth
					>
						{isGenerating ? 'Generating...' : 'Generate QR Code'}
					</Button>

					{#if !isValid && amount > 0}
						<div class="validation-summary">
							{validateAmount() || validateAddress()}
						</div>
					{/if}

					<!-- Debug info (temporary) -->
					<div class="debug-info" style="font-size: 12px; color: #888; margin-top: 10px;">
						Debug: Amount={amount} (Number: {Number(amount)}), Address={starknetAddress?.substring(
							0,
							10
						)}..., AmountValid={validateAmount()}, AddressValid={validateAddress()}, IsValid={isValid}
					</div>
				</div>
			{:else}
				<!-- QR Code Generated - Show QR with Editable Amount -->
				<div class="qr-with-controls">
					<!-- Amount Control Section -->
					<div class="amount-control-section">
						<h4>💰 Adjust Amount</h4>
						<div class="amount-input">
							<label for="amount-edit">Amount to receive (in sats):</label>
							<div class="input-group">
								<input
									id="amount-edit"
									type="number"
									bind:value={amount}
									placeholder="e.g., 50000"
									min="1"
									max="100000000"
									class="amount-field"
									class:error={validateAmount() !== null}
								/>
								<span class="input-suffix">sats</span>
							</div>
							{#if amountFormatted}
								<div class="amount-preview">
									{amountFormatted} satoshis
								</div>
							{/if}
							{#if validateAmount() && amount > 0}
								<div class="validation-error">
									{validateAmount()}
								</div>
							{/if}
							<p class="update-hint">💡 QR code updates automatically when you change the amount</p>
						</div>
					</div>

					<!-- QR Code Display -->
					<StarknetReceiveDisplay {receiveData} onCopy={handleCopy} />

					<!-- Actions -->
					<div class="actions">
						<Button variant="secondary" on:click={reset}>Generate New QR Code</Button>
					</div>
				</div>
			{/if}

			<!-- Copy Success Message -->
			{#if copySuccess}
				<div class="copy-success">
					✅ {copySuccess}
				</div>
			{/if}

			<!-- Error Display -->
			{#if errorMessage}
				<div class="error-message">
					<p>{errorMessage}</p>
				</div>
			{/if}

			<!-- Information Section -->
			<div class="info-section">
				<div class="info-item">
					<span class="info-icon">💡</span>
					<div class="info-content">
						<p>
							<strong>How it works:</strong>
							This generates a QR code containing your Starknet address, the amount in satoshis, and
							the network identifier.
						</p>
						<p>
							The sender can scan this QR code to get all the necessary information to send you
							Bitcoin from the Starknet network.
						</p>
					</div>
				</div>
			</div>
		</div>
	</Card>
{/if}

<style>
	.starknet-receive {
		padding: 20px;
		max-width: 500px;
		margin: 0 auto;
	}

	.starknet-receive h3 {
		margin: 0 0 10px 0;
		color: #fff;
		text-align: center;
	}

	.description {
		color: #b0b0b0;
		font-size: 14px;
		text-align: center;
		margin-bottom: 20px;
		line-height: 1.4;
	}

	.input-section {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		margin-bottom: 1.5rem;
	}

	.amount-input {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.amount-input label {
		font-weight: 500;
		color: #fff;
		font-size: 0.875rem;
	}

	.input-group {
		display: flex;
		align-items: center;
		position: relative;
	}

	.amount-field {
		flex: 1;
		padding: 0.75rem 4rem 0.75rem 0.75rem;
		border: 1px solid #555;
		border-radius: 6px;
		background: #2a2a2a;
		color: #fff;
		font-size: 1rem;
		transition: border-color 0.2s;
	}

	.amount-field:focus {
		outline: none;
		border-color: #0070f3;
	}

	.amount-field.error {
		border-color: #dc3545;
	}

	/* Remove number input spinners */
	.amount-field::-webkit-outer-spin-button,
	.amount-field::-webkit-inner-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}

	.amount-field[type='number'] {
		-moz-appearance: textfield;
	}

	.input-suffix {
		position: absolute;
		right: 0.75rem;
		color: #888;
		font-size: 0.875rem;
		pointer-events: none;
	}

	.amount-preview {
		font-size: 0.75rem;
		color: #888;
		font-style: italic;
	}

	.address-info {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.address-info label {
		font-weight: 500;
		color: #fff;
		font-size: 0.875rem;
	}

	.address-display {
		padding: 0.75rem;
		background: #2a2a2a;
		border: 1px solid #555;
		border-radius: 6px;
	}

	.address-display code {
		color: #fff;
		font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
		font-size: 0.875rem;
	}

	.generate-section {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-bottom: 1.5rem;
	}

	.validation-error,
	.validation-summary {
		text-align: center;
		color: #dc3545;
		font-size: 0.875rem;
		font-weight: 500;
	}

	.actions {
		display: flex;
		justify-content: center;
		margin-top: 1.5rem;
	}

	.copy-success {
		background: rgba(40, 167, 69, 0.1);
		border: 1px solid #28a745;
		border-radius: 4px;
		padding: 10px;
		margin-top: 1rem;
		text-align: center;
		color: #28a745;
		font-size: 14px;
	}

	.error-message {
		background: rgba(244, 67, 54, 0.1);
		border: 1px solid #f44336;
		border-radius: 4px;
		padding: 10px;
		margin-top: 20px;
	}

	.error-message p {
		color: #f44336;
		margin: 0;
		font-size: 14px;
	}

	.info-section {
		background: rgba(255, 255, 255, 0.05);
		border-radius: 8px;
		padding: 1rem;
		margin-top: 1.5rem;
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
		color: #b0b0b0;
	}

	.info-content p:last-child {
		margin-bottom: 0;
	}

	.info-content strong {
		color: #fff;
	}

	/* QR with controls layout */
	.qr-with-controls {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.amount-control-section {
		background: rgba(255, 255, 255, 0.05);
		border-radius: 8px;
		padding: 1rem;
		border: 1px solid #444;
	}

	.amount-control-section h4 {
		margin: 0 0 1rem 0;
		color: #fff;
		font-size: 1rem;
		font-weight: 600;
	}

	.update-hint {
		margin: 0.5rem 0 0 0;
		font-size: 0.75rem;
		color: #888;
		font-style: italic;
	}

	/* Responsive design */
	@media (max-width: 767px) {
		.starknet-receive {
			padding: 15px;
		}

		.input-section {
			gap: 1rem;
		}

		.generate-section {
			gap: 0.5rem;
		}

		.info-section {
			padding: 0.75rem;
		}

		.info-item {
			gap: 0.5rem;
		}
	}
</style>
