<!--
  @component
  Starknet to Lightning Swap Component (Refactored)
  
  This component provides a user interface for sending Starknet assets and
  receiving Bitcoin via Lightning Network. Uses composable architecture
  for better separation of concerns and maintainability.
  
  @author bim
  @version 2.0.0
-->

<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { StarknetToLightningSwap } from '$lib/services/client/lightning.client.service';
	import { useStarknetToLightningSwap } from '$lib/composables/useStarknetToLightningSwap';
	import SwapForm from './SwapForm.svelte';
	import SwapDetails from './SwapDetails.svelte';
	import PaymentMonitor from './PaymentMonitor.svelte';

	// Component props
	export let starknetAddress: string;
	export let onSwapComplete: (swap: StarknetToLightningSwap) => void = () => {};
	export let onError: (error: string) => void = () => {};

	// Use the composable for all swap logic
	const {
		state,
		formData,
		validation,
		createSwap,
		executeSwapTransactions,
		reset,
		updateFormData,
		formatEstimatedOutput
	} = useStarknetToLightningSwap();

	// PaymentMonitor component reference (kept for compatibility)
	let paymentMonitor: PaymentMonitor;

	// Initialize starknet address
	$: updateFormData({ starknetAddress });

	// Handle form interactions
	function handleCreateSwap() {
		createSwap({
			onSuccess: onSwapComplete,
			onError
		});
	}

	function handleLightningAddressChange(value: string) {
		updateFormData({ lightningAddress: value });
	}

	function handleSourceAssetChange(value: any) {
		updateFormData({ sourceAsset: value });
	}

	// Handle legacy PaymentMonitor events
	function handleComplete(status: any) {
		console.log('Starknet to Lightning swap completed:', status);
		if ($state.currentSwap) {
			onSwapComplete($state.currentSwap);
		}
	}

	function handleError(error: string) {
		console.error('Starknet to Lightning swap error:', error);
		onError(error);
	}

	// Cleanup on destroy
	onDestroy(() => {
		if (paymentMonitor) {
			paymentMonitor.stopMonitoring();
		}
	});
</script>

<div class="starknet-to-lightning-container">
	<!-- Swap Creation Form -->
	{#if $state.swapPhase === 'form'}
		<SwapForm
			{starknetAddress}
			lightningAddress={$formData.lightningAddress}
			sourceAsset={$formData.sourceAsset}
			canCreateSwap={$validation.canCreateSwap}
			isCreating={$state.isCreating}
			errorMessage={$state.errorMessage}
			loadingMessage={$state.loadingMessage}
			onCreateSwap={handleCreateSwap}
			onLightningAddressChange={handleLightningAddressChange}
			onSourceAssetChange={handleSourceAssetChange}
		/>
	{/if}

	<!-- Swap Details Display -->
	{#if $state.currentSwap && $state.swapPhase !== 'form'}
		<SwapDetails
			swap={$state.currentSwap}
			sourceAsset={$formData.sourceAsset}
			swapPhase={$state.swapPhase}
			transactionProgress={$state.transactionProgress}
			isExecutingTransactions={$state.isExecutingTransactions}
			onReset={reset}
			{formatEstimatedOutput}
		/>

		<!-- Legacy Payment Monitor (kept for compatibility) -->
		{#if $state.swapPhase === 'form'}
			<PaymentMonitor
				bind:this={paymentMonitor}
				onComplete={handleComplete}
				onError={handleError}
			/>
		{/if}
	{/if}
</div>

<style>
	.starknet-to-lightning-container {
		max-width: 600px;
		margin: 0 auto;
	}
</style>
