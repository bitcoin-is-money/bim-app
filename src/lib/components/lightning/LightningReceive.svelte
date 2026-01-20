<!--
  @component
  Lightning Bitcoin Receive Component - Orchestrator
  
  This component orchestrates the Bitcoin receive flow by coordinating
  the extracted specialized components. It maintains top-level state
  and handles communication between components.
  
  @author bim
  @version 2.0.0 - Refactored to use component composition
-->

<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import type { SwapStatus } from '$lib/services/client/lightning.client.service';
	import { t } from 'svelte-i18n';
	// Import extracted components
	import SwipeableCardContainer from './SwipeableCardContainer.svelte';

	// Component props
	export let starknetAddress: string;
	export let onPaymentComplete: (status: SwapStatus) => void = () => {};
	export let onError: (error: string) => void = () => {};
	export let initiallyVisible: boolean = false;

	// Main component state
	let isVisible = initiallyVisible;
	let paymentMethod: 'lightning' | 'bitcoin' = 'lightning';

	/**
	 * Event handlers for component communication
	 */
	function handleMethodChange(event: CustomEvent<{ method: 'lightning' | 'bitcoin' }>) {
		paymentMethod = event.detail.method;
	}

	/**
	 * Reset component state
	 */
	function reset() {
		// Reset any payment state but preserve form inputs
		// This function is called when hiding the component
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
</script>

<!-- Bitcoin Receive Toggle Button (only show if not initially visible) -->
{#if !initiallyVisible}
	<Button variant="info" on:click={toggleVisibility}>
		{#if isVisible}
			{$t('toggle.hide')}
		{:else}
			{$t('toggle.show')}
		{/if}
	</Button>
{/if}

{#if isVisible}
	<SwipeableCardContainer
		bind:paymentMethod
		{starknetAddress}
		{onPaymentComplete}
		{onError}
		on:methodChange={handleMethodChange}
		on:lightningClaimSuccess
	/>
{/if}

<style>
	/* Responsive design */
	@media (max-width: 767px) {
		/* Mobile-specific styles handled by SwipeableCardContainer */
	}
</style>
