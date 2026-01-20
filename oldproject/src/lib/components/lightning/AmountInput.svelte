<!--
  @component
  Amount Input Component
  
  This component provides a focused UI for entering payment amounts with
  validation, formatting, and display mode switching (sats/USD).
  
  @prop amount - Current amount in satoshis
  @prop limits - Asset limits for validation
  @prop displayMode - How to display the amount (sats/usd)
  @prop disabled - Whether input is disabled
  @prop onAmountChange - Callback when amount changes
  @prop onDisplayModeChange - Callback when display mode changes
  
  @author bim
  @version 1.0.0
-->

<script lang="ts">
	import type { PriceData } from '$lib/services/client/pricing/types';
	import { onDestroy } from 'svelte';
	import { t } from 'svelte-i18n';

	// Local, client-safe limits type to avoid importing server modules
	type AmountLimits = { minAmount: number; maxAmount: number };

	// Component props
	export let amount = 0;
	export let limits: AmountLimits | null = null;
	export let displayMode: 'sats' | 'usd' = 'sats';
	export let disabled = false;
	// Optional price data to support conversions when displayMode is usd
	export let price: PriceData | null = null;
	export let onAmountChange: (amount: number) => void = () => {};
	export let onDisplayModeChange: (mode: 'sats' | 'usd') => void = () => {};
	// Restrict which modes are available to the user (default: all)
	export let allowedModes: Array<'sats' | 'usd'> = ['sats', 'usd'];

	// Local state
	let inputValue = amount.toString();
	let validationError = '';
	let isInputFocused = false;
	let debounceTimeout: number | undefined;

	// Helper: format input based on display mode
	function formatInputValue(amountSats: number): string {
		if (displayMode === 'sats') {
			return String(Math.max(0, Math.floor(amountSats)));
		}
		// USD
		if (price) {
			const usd = (amountSats / 100_000_000) * price.usdPrice;
			return usd.toFixed(2);
		}
		return '';
	}

	// Update input when amount or mode changes (only when not actively editing)
	$: if (!isInputFocused) {
		inputValue = formatInputValue(amount);
	}

	// Validate amount when it changes
	$: validateAmount(amount);

	// Cleanup timeout on component destroy
	onDestroy(() => {
		if (debounceTimeout) {
			clearTimeout(debounceTimeout);
		}
	});

	/**
	 * Handle input value changes with debouncing
	 */
	function handleInput(event: Event) {
		const target = event.target as HTMLInputElement;
		const newValue = target.value;

		// Update local state immediately for responsive UI
		inputValue = newValue;

		// Clear existing timeout
		if (debounceTimeout) {
			clearTimeout(debounceTimeout);
		}

		// Debounce the parent callback to prevent rapid updates
		debounceTimeout = setTimeout(() => {
			const sanitized = (newValue || '').toString().replace(/[,_\s]/g, '');
			let newSats = amount;
			if (displayMode === 'sats') {
				const parsed = Number(sanitized);
				newSats = Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
			} else if (displayMode === 'usd') {
				const usd = parseFloat(sanitized.replace(/[^\d.\-]/g, ''));
				if (Number.isFinite(usd) && price?.usdPrice) {
					newSats = Math.max(0, Math.round((usd / price.usdPrice) * 100_000_000));
				}
			}
			onAmountChange(newSats);
		}, 150) as any;
	}

	/**
	 * Handle input focus events
	 */
	function handleFocus() {
		isInputFocused = true;
	}

	/**
	 * Handle input blur events
	 */
	function handleBlur() {
		isInputFocused = false;
		// Trigger immediate update on blur to sync state
		if (debounceTimeout) {
			clearTimeout(debounceTimeout);
		}
		const sanitized = (inputValue || '').toString().replace(/[,_\s]/g, '');
		let newSats = amount;
		if (displayMode === 'sats') {
			const parsed = Number(sanitized);
			newSats = Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
		} else if (displayMode === 'usd') {
			const usd = parseFloat(sanitized.replace(/[^\d.\-]/g, ''));
			if (Number.isFinite(usd) && price?.usdPrice) {
				newSats = Math.max(0, Math.round((usd / price.usdPrice) * 100_000_000));
			}
		}
		onAmountChange(newSats);
	}

	/**
	 * Validate the current amount against limits
	 */
	function validateAmount(currentAmount: number) {
		validationError = '';

		if (!limits) return;

		if (currentAmount < limits.minAmount) {
			validationError = $t('validation.minimumAmount', {
				amount: formatAmount(limits.minAmount)
			});
		} else if (currentAmount > limits.maxAmount) {
			validationError = $t('validation.maximumAmount', {
				amount: formatAmount(limits.maxAmount)
			});
		}
	}

	/**
	 * Handle display mode change
	 */
	function handleDisplayModeChange(mode: 'sats' | 'usd') {
		if (!allowedModes.includes(mode)) return;
		displayMode = mode;
		onDisplayModeChange(mode);
	}

	// Ensure current displayMode is allowed; if not, pick a safe fallback
	$: if (!allowedModes.includes(displayMode)) {
		displayMode = allowedModes.includes('sats') ? 'sats' : allowedModes[0] || 'sats';
	}

	/**
	 * Format amount for display
	 */
	function formatAmount(sats: number): string {
		return new Intl.NumberFormat().format(sats);
	}

	/**
	 * Get the display unit for current mode
	 */
	function getDisplayUnit(mode: 'sats' | 'usd'): string {
		switch (mode) {
			case 'usd':
				return 'USD';
			case 'sats':
			default:
				return 'sats';
		}
	}

	/**
	 * Set amount to minimum limit
	 */
	function setMinAmount() {
		if (limits) {
			onAmountChange(limits.minAmount);
		}
	}

	/**
	 * Set amount to maximum limit
	 */
	function setMaxAmount() {
		if (limits) {
			onAmountChange(limits.maxAmount);
		}
	}
</script>

<div class="amount-input-container">
	<div class="amount-input-header">
		<label for="amount-input">Amount</label>
		<div class="display-mode-selector" data-swipe-ignore>
			{#if allowedModes.includes('sats')}
				<button
					class="mode-button"
					class:active={displayMode === 'sats'}
					data-swipe-ignore
					on:click={() => handleDisplayModeChange('sats')}
				>
					SATS
				</button>
			{/if}
			{#if allowedModes.includes('usd')}
				<button
					class="mode-button"
					class:active={displayMode === 'usd'}
					data-swipe-ignore
					on:click={() => handleDisplayModeChange('usd')}
				>
					USD
				</button>
			{/if}
		</div>
	</div>

	<div class="amount-input-wrapper">
		<input
			id="amount-input"
			type="number"
			value={inputValue}
			on:input={handleInput}
			on:focus={handleFocus}
			on:blur={handleBlur}
			{disabled}
			min={limits?.minAmount || 0}
			max={limits?.maxAmount || 100_000_000}
			step={displayMode === 'usd' ? '0.01' : '1'}
			placeholder={`Enter amount in ${getDisplayUnit(displayMode)}`}
			class="amount-input"
			class:error={validationError}
		/>
		<span class="amount-unit">{getDisplayUnit(displayMode)}</span>
	</div>

	{#if amount > 0 && displayMode === 'usd'}
		<div class="amount-conversion">
			≈ {formatAmount(amount)} sats
		</div>
	{/if}

	{#if validationError}
		<div class="validation-error">
			{validationError}
		</div>
	{/if}

	{#if limits}
		<div class="amount-limits">
			<button class="limit-button" on:click={setMinAmount} {disabled}>
				Min: {formatAmount(limits.minAmount)}
			</button>
			<button class="limit-button" on:click={setMaxAmount} {disabled}>
				Max: {formatAmount(limits.maxAmount)}
			</button>
		</div>
	{/if}
</div>

<style>
	.amount-input-container {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.amount-input-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.amount-input-header label {
		font-weight: 500;
		font-size: 1rem;
	}

	.display-mode-selector {
		display: flex;
		gap: 0.25rem;
		background: var(--color-surface-variant, #f5f5f5);
		padding: 0.125rem;
		border-radius: 4px;
	}

	.mode-button {
		padding: 0.25rem 0.5rem;
		border: none;
		background: transparent;
		border-radius: 3px;
		cursor: pointer;
		font-size: 0.75rem;
		font-weight: 500;
		transition: all 0.2s ease;
	}

	.mode-button:hover {
		background: var(--color-surface-hover, #e8e8e8);
	}

	.mode-button.active {
		background: var(--color-primary, #0070f3);
		color: white;
	}

	.amount-input-wrapper {
		position: relative;
		display: flex;
		align-items: center;
	}

	.amount-input {
		width: 100%;
		padding: 0.75rem;
		padding-right: 3rem;
		border: 2px solid var(--color-border, #ddd);
		border-radius: 8px;
		font-size: 1.125rem;
		font-weight: 500;
		transition: border-color 0.2s ease;
	}

	.amount-input:focus {
		outline: none;
		border-color: var(--color-primary, #0070f3);
	}

	.amount-input.error {
		border-color: var(--color-error, #dc3545);
	}

	.amount-input:disabled {
		background: var(--color-surface-disabled, #f8f9fa);
		cursor: not-allowed;
	}

	/* Remove number input spinners/arrows */
	.amount-input::-webkit-outer-spin-button,
	.amount-input::-webkit-inner-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}

	.amount-input[type='number'] {
		-moz-appearance: textfield;
		appearance: textfield;
	}

	.amount-unit {
		position: absolute;
		right: 0.75rem;
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--color-text-secondary, #666);
		pointer-events: none;
	}

	.amount-conversion {
		text-align: center;
		font-size: 0.875rem;
		color: var(--color-text-secondary, #666);
		font-style: italic;
	}

	.validation-error {
		color: var(--color-error, #dc3545);
		font-size: 0.875rem;
		font-weight: 500;
	}

	.amount-limits {
		display: flex;
		gap: 0.5rem;
		justify-content: center;
	}

	.limit-button {
		padding: 0.25rem 0.5rem;
		border: 1px solid var(--color-border, #ddd);
		background: var(--color-surface, white);
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.75rem;
		transition: all 0.2s ease;
	}

	.limit-button:hover:not(:disabled) {
		background: var(--color-surface-hover, #f8f9fa);
		border-color: var(--color-primary, #0070f3);
	}

	.limit-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	@media (max-width: 640px) {
		.amount-input-header {
			flex-direction: column;
			gap: 0.5rem;
			align-items: stretch;
		}

		.display-mode-selector {
			justify-content: center;
		}
	}
</style>
