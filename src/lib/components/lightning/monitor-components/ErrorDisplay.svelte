<script lang="ts">
	export let error: string;
</script>

<div class="error-display">
	<span class="error-icon">⚠️</span>
	<span class="error-message">{error}</span>
</div>

<style>
	.error-display {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px;
		background: #fef2f2;
		border: 1px solid #fecaca;
		border-radius: 4px;
		color: #dc2626;
		font-size: 14px;
	}
</style>
