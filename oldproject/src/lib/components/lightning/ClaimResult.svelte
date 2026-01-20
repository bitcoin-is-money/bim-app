<!--
  @component
  Claim Result Component
  
  Displays the result of a claim operation (success or error).
  
  @prop message - The result message to display
  @prop success - Whether the operation was successful
  
  @author bim
  @version 1.0.0
-->

<script lang="ts">
	// Component props
	export let message = '';
	export let success = false;
</script>

{#if message}
	<div class="claim-result" class:success>
		{message}
	</div>
{/if}

<style>
	.claim-result {
		margin: 1rem 0 0 0;
		padding: 0.75rem;
		border-radius: 6px;
		font-size: 0.875rem;
		font-weight: 500;
		background: #f44336;
		color: white;
	}

	.claim-result.success {
		background: #4caf50;
	}
</style>
