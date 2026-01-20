<script lang="ts">
	export let size: 'small' | 'medium' | 'large' = 'medium';
	export let color: 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'white' = 'primary';
	export let centered = false;
	export let text = '';
</script>

<div class="spinner-container" class:spinner-centered={centered}>
	<div class="spinner spinner-{size} spinner-{color}"></div>
	{#if text}
		<div class="spinner-text">{text}</div>
	{/if}
</div>

<style>
	.spinner-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
	}

	.spinner-centered {
		justify-content: center;
		min-height: 100px;
	}

	.spinner {
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	.spinner-small {
		width: 16px;
		height: 16px;
		border-width: 2px;
	}

	.spinner-medium {
		width: 24px;
		height: 24px;
		border-width: 3px;
	}

	.spinner-large {
		width: 32px;
		height: 32px;
		border-width: 4px;
	}

	.spinner-primary {
		border: 3px solid #404040;
		border-top: 3px solid #007bff;
	}

	.spinner-secondary {
		border: 3px solid #404040;
		border-top: 3px solid #6c757d;
	}

	.spinner-success {
		border: 3px solid #404040;
		border-top: 3px solid #28a745;
	}

	.spinner-warning {
		border: 3px solid #404040;
		border-top: 3px solid #ffc107;
	}

	.spinner-error {
		border: 3px solid #404040;
		border-top: 3px solid #dc3545;
	}

	.spinner-white {
		border: 3px solid rgba(255, 255, 255, 0.3);
		border-top: 3px solid white;
	}

	.spinner-text {
		color: #b0b0b0;
		font-size: 14px;
		font-style: italic;
		text-align: center;
	}

	@keyframes spin {
		0% {
			transform: rotate(0deg);
		}
		100% {
			transform: rotate(360deg);
		}
	}
</style>
