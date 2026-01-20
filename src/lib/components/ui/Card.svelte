<script lang="ts">
	export let variant: 'default' | 'elevated' | 'outlined' | 'flat' = 'default';
	export let padding: 'none' | 'small' | 'medium' | 'large' = 'medium';
	export let background: 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info' =
		'primary';
	export let rounded: 'none' | 'small' | 'medium' | 'large' = 'medium';
	export let fullWidth = false;
	export let clickable = false;
	export let className: string = '';
</script>

{#if clickable}
	<div
		class="card card-{variant} card-{background} card-padding-{padding} card-rounded-{rounded} {className}"
		class:card-full-width={fullWidth}
		class:card-clickable={clickable}
		on:click
		on:keydown
		tabindex="0"
		role="button"
	>
		<slot />
	</div>
{:else}
	<div
		class="card card-{variant} card-{background} card-padding-{padding} card-rounded-{rounded} {className}"
		class:card-full-width={fullWidth}
	>
		<slot />
	</div>
{/if}

<style>
	.card {
		box-sizing: border-box;
		position: relative;
		display: block;
		transition: all 0.2s ease;
	}

	.card-full-width {
		width: 100%;
	}

	.card-clickable {
		cursor: pointer;
	}

	.card-clickable:hover {
		transform: translateY(-2px);
	}

	.card-clickable:focus {
		outline: 2px solid #fff;
		outline-offset: 2px;
	}

	/* Variants */
	.card-default {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
	}

	.card-elevated {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		box-shadow: var(--shadow-md);
	}

	.card-outlined {
		background: transparent;
		border: 2px solid var(--color-border);
	}

	.card-flat {
		background: var(--color-surface);
		border: none;
	}

	/* Background colors */
	.card-primary {
		background: var(--color-background, #2d2d2d);
		border-color: var(--color-border, #404040);
		color: var(--color-text, #ffffff);
	}

	.card-secondary {
		background: var(--color-surface, #1e1e1e);
		border-color: var(--color-border, #404040);
		color: var(--color-text, #ffffff);
	}

	.card-success {
		background: var(--color-success, #1a4a1a);
		border-color: var(--color-success-border, #2d5a2d);
		color: var(--color-text, #ffffff);
	}

	.card-warning {
		background: var(--color-warning, #4a3a1a);
		border-color: var(--color-warning-border, #7a5a2a);
		color: var(--color-text, #ffffff);
	}

	.card-error {
		background: var(--color-error, #4a1a1a);
		border-color: var(--color-error-border, #7a2a2a);
		color: var(--color-text, #ffffff);
	}

	.card-info {
		background: var(--color-accent, #1a3a4a);
		border-color: var(--color-accent-border, #2a5a7a);
		color: var(--color-text, #ffffff);
	}

	/* Padding */
	.card-padding-none {
		padding: 0;
	}

	.card-padding-small {
		padding: 12px;
	}

	.card-padding-medium {
		padding: 20px;
	}

	.card-padding-large {
		padding: 32px;
	}

	/* Rounded corners */
	.card-rounded-none {
		border-radius: 0;
	}

	.card-rounded-small {
		border-radius: 4px;
	}

	.card-rounded-medium {
		border-radius: 8px;
	}

	.card-rounded-large {
		border-radius: 12px;
	}

	/* Mobile optimization */
	@media (max-width: 767px) {
		.card-padding-small {
			padding: 8px;
		}

		.card-padding-medium {
			padding: 16px;
		}

		.card-padding-large {
			padding: 24px;
		}
	}
</style>
