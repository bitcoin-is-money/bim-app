<script lang="ts">
	export let variant: 'primary' | 'secondary' | 'success' | 'danger' | 'info' = 'primary';
	export let size: 'small' | 'medium' | 'large' = 'medium';
	export let disabled = false;
	export let loading = false;
	export let fullWidth = false;
	export let type: 'button' | 'submit' | 'reset' = 'button';
</script>

<button
	class="btn btn-{variant} btn-{size}"
	class:btn-full-width={fullWidth}
	class:btn-loading={loading}
	{disabled}
	{type}
	on:click
>
	{#if loading}
		<span class="loading-spinner"></span>
	{/if}
	<slot />
</button>

<style>
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		border: none;
		border-radius: 6px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
		position: relative;
		box-sizing: border-box;
		text-decoration: none;
		font-family: inherit;
	}

	.btn:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}

	.btn-small {
		padding: 8px 12px;
		font-size: 13px;
		min-height: 32px;
	}

	.btn-medium {
		padding: 12px 16px;
		font-size: 14px;
		min-height: 40px;
	}

	.btn-large {
		padding: 16px 20px;
		font-size: 16px;
		min-height: 48px;
	}

	.btn-full-width {
		width: 100%;
	}

	.btn-primary,
	.btn-secondary,
	.btn-success,
	.btn-danger,
	.btn-info {
		background: var(--color-primary, #f69413);
		color: #fff;
	}

	.btn-primary:hover:not(:disabled),
	.btn-secondary:hover:not(:disabled),
	.btn-success:hover:not(:disabled),
	.btn-danger:hover:not(:disabled),
	.btn-info:hover:not(:disabled) {
		background: var(--color-primary-dark, #d9820a);
		opacity: 0.9;
		transform: translateY(-1px);
		box-shadow: var(--shadow-md);
	}

	.loading-spinner {
		width: 16px;
		height: 16px;
		border: 2px solid transparent;
		border-top: 2px solid currentColor;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		0% {
			transform: rotate(0deg);
		}
		100% {
			transform: rotate(360deg);
		}
	}

	.btn-loading {
		pointer-events: none;
	}

	/* Mobile touch targets */
	@media (hover: none) and (pointer: coarse) {
		.btn {
			min-height: 44px;
		}
	}
</style>
