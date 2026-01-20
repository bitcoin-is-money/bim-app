<script lang="ts">
	export let type: 'text' | 'email' | 'password' | 'number' | 'tel' | 'url' = 'text';
	export let placeholder = '';
	export let value = '';
	export let label = '';
	export let error = '';
	export let disabled = false;
	export let required = false;
	export let id = '';
	export let name = '';
	export let autocomplete = '';
	export let readonly = false;
	export let maxlength: number | undefined = undefined;
	export let minlength: number | undefined = undefined;
	export let pattern: string | undefined = undefined;
	export let size: 'small' | 'medium' | 'large' = 'medium';
	export let fullWidth = false;

	// Generate unique ID if not provided
	const uniqueId = id || `input-${Math.random().toString(36).substr(2, 9)}`;
</script>

<div class="input-group" class:input-group-full-width={fullWidth}>
	{#if label}
		<label for={uniqueId} class="input-label" class:input-label-required={required}>
			{label}
			{#if required}<span class="required-star">*</span>{/if}
		</label>
	{/if}

	<input
		{type}
		{placeholder}
		{disabled}
		{required}
		{readonly}
		{maxlength}
		{minlength}
		{pattern}
		{autocomplete}
		id={uniqueId}
		name={name || uniqueId}
		class="input input-{size}"
		class:input-error={error}
		class:input-disabled={disabled}
		bind:value
		on:input
		on:change
		on:focus
		on:blur
		on:keydown
		on:keypress
		on:keyup
	/>

	{#if error}
		<div class="input-error-message">{error}</div>
	{/if}
</div>

<style>
	.input-group {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.input-group-full-width {
		width: 100%;
	}

	.input-label {
		font-weight: 500;
		font-size: 14px;
		color: var(--color-text);
		margin-bottom: 4px;
		text-align: left;
	}

	.input-label-required {
		color: var(--color-text);
	}

	.required-star {
		color: var(--color-error);
		margin-left: 2px;
	}

	.input {
		border: none;
		border-bottom: 0.5px solid #fff;
		border-radius: var(--radius-md);
		background: var(--color-surface);
		color: var(--color-text);
		font-size: 14px;
		transition: all 0.2s ease;
		font-family: inherit;
		box-sizing: border-box;
		width: 100%;
		padding-left: 16px;
		padding-right: 16px;
	}

	.input-small {
		padding: var(--space-xs) var(--space-sm);
		min-height: 32px;
		font-size: 13px;
	}

	.input-medium {
		padding: var(--space-sm) var(--space-md);
		min-height: 40px;
		font-size: 14px;
	}

	.input-large {
		padding: var(--space-md) var(--space-lg);
		min-height: 48px;
		font-size: 16px;
	}

	.input:focus {
		outline: none;
		border-color: var(--color-primary);
		box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
	}

	.input:hover:not(:disabled):not(:focus) {
		border-color: var(--color-primary-dark);
	}

	.input-error {
		border-color: var(--color-error);
	}

	.input-error:focus {
		border-color: var(--color-error);
		box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
	}

	.input-disabled {
		background: var(--color-border);
		color: var(--color-text-light);
		cursor: not-allowed;
		opacity: 0.6;
	}

	.input::placeholder {
		color: var(--color-text-light);
	}

	.input-error-message {
		color: var(--color-error);
		font-size: 12px;
		margin-top: 2px;
	}

	/* Mobile optimization */
	@media (hover: none) and (pointer: coarse) {
		.input {
			min-height: 44px;
			font-size: 16px; /* Prevent zoom on iOS */
		}
	}
</style>
