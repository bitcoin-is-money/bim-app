<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import LoadingSpinner from '$lib/components/ui/LoadingSpinner.svelte';
	import type { SourceAsset } from '$lib/composables/useStarknetToLightningSwap';

	export let starknetAddress: string;
	export let lightningAddress: string;
	export let sourceAsset: SourceAsset;
	export let canCreateSwap: boolean;
	export let isCreating: boolean;
	export let errorMessage: string;
	export let loadingMessage: string;
	export let onCreateSwap: () => void;
	export let onLightningAddressChange: (value: string) => void;
	export let onSourceAssetChange: (value: SourceAsset) => void;

	function handleLightningAddressChange(event: Event) {
		const target = event.target as HTMLInputElement;
		onLightningAddressChange(target.value);
	}
</script>

<Card>
	<div class="swap-form">
		<h3>Send Bitcoin → Receive Bitcoin via Lightning</h3>
		<p class="description">
			Send your WBTC (Wrapped Bitcoin) and receive Bitcoin via Lightning Network
		</p>

		<!-- User's Starknet Address Display -->
		<div class="form-group">
			<label>Your Starknet Address</label>
			<div class="address-display">
				<code>{starknetAddress}</code>
			</div>
			<small class="help-text">This is your Starknet address where you'll send WBTC from</small>
		</div>

		<!-- Lightning Address Input -->
		<div class="form-group">
			<label for="lightningAddress">Lightning Address</label>
			<Input
				id="lightningAddress"
				type="text"
				value={lightningAddress}
				on:input={handleLightningAddressChange}
				placeholder="user@lightning.com or lnbc..."
			/>
			<small class="help-text">Enter your Lightning address or invoice to receive Bitcoin</small>
		</div>

		<!-- Create Swap Button -->
		<Button on:click={onCreateSwap} disabled={!canCreateSwap} class="create-swap-btn">
			{#if isCreating}
				<LoadingSpinner size="small" />
				Creating Swap...
			{:else}
				Create Swap
			{/if}
		</Button>

		<!-- Error Display -->
		{#if errorMessage}
			<div class="error-message">
				{errorMessage}
			</div>
		{/if}

		<!-- Loading Message -->
		{#if loadingMessage}
			<div class="loading-message">
				{loadingMessage}
			</div>
		{/if}
	</div>
</Card>

<style>
	.swap-form {
		padding: 20px;
	}

	.swap-form h3 {
		margin-top: 0;
		margin-bottom: 8px;
		color: #fff;
		font-size: 1.5rem;
		font-weight: 600;
	}

	.description {
		margin-bottom: 24px;
		color: #b0b0b0;
		font-size: 0.9rem;
	}

	.form-group {
		margin-bottom: 20px;
	}

	.form-group label {
		display: block;
		margin-bottom: 8px;
		color: #fff;
		font-weight: 500;
	}

	.address-display {
		background: #1a1a1a;
		border: 1px solid #333;
		border-radius: 8px;
		padding: 12px;
		font-family: 'Courier New', monospace;
		color: #00ff00;
		word-break: break-all;
	}

	.help-text {
		display: block;
		margin-top: 4px;
		color: #888;
		font-size: 0.8rem;
	}

	.create-swap-btn {
		width: 100%;
		margin-top: 1rem;
	}

	.error-message {
		margin-top: 16px;
		padding: 12px;
		background: #2d1b1b;
		border: 1px solid #ff4444;
		border-radius: 8px;
		color: #ff4444;
		font-size: 0.9rem;
	}

	.loading-message {
		margin-top: 16px;
		padding: 12px;
		background: #1b2d1b;
		border: 1px solid #44ff44;
		border-radius: 8px;
		color: #44ff44;
		font-size: 0.9rem;
	}
</style>
