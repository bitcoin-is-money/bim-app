<!--
  @component
  Claim Actions Component
  
  Action buttons for claiming Lightning payments.
  
  @prop isClaiming - Whether a claim operation is in progress
  @prop usePaymaster - Whether to use gasless transactions
  @prop on:claim - Event fired when claim button is clicked
  
  @author bim
  @version 1.0.0
-->

<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import LoadingSpinner from '$lib/components/ui/LoadingSpinner.svelte';

	// Component props
	export let isClaiming = false;
	export let usePaymaster = false;

	// Event dispatcher
	const dispatch = createEventDispatcher<{
		claim: void;
	}>();

	// Handle claim button click
	function handleClaim() {
		dispatch('claim');
	}
</script>

<div class="claim-actions">
	<Button variant="primary" size="large" disabled={isClaiming} on:click={handleClaim}>
		{#if isClaiming}
			<LoadingSpinner size="small" />
			{usePaymaster ? 'Claiming (Gasless)...' : 'Claiming...'}
		{:else}
			{usePaymaster ? 'Claim (Gasless)' : 'Claim Payment'}
		{/if}
	</Button>
</div>

<style>
	.claim-actions {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		align-items: center;
	}

	@media (max-width: 640px) {
		.claim-actions {
			gap: 0.75rem;
		}

		.claim-actions :global(button) {
			width: 100%;
		}
	}
</style>
