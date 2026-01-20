<footer
	class="footer"
	on:click={() => (window.location.href = '/about-bim')}
	tabindex="0"
	role="link"
	aria-label="About Bim"
>
	<div class="footer-content">
		<img src="/tiny-logo.png" alt="Tiny Logo" class="footer-logo" />
	</div>
</footer>

<style>
	.footer {
		width: 100%;
		height: 56px;
		background: var(--color-background);
		color: var(--color-text-light);
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.04);
		padding: 0 0.5rem;
		cursor: pointer;
		outline: none;
		position: fixed;
		bottom: 20px;
		left: 0;
		z-index: 100;
	}
	.footer:focus {
		box-shadow:
			0 0 0 3px var(--color-primary),
			0 0 0 1px var(--color-background);
	}
	.footer-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
	}
	.footer-logo {
		width: 24px;
		height: 24px;
		margin-bottom: 2px;
		display: block;
	}
	@media (max-width: 600px) {
		.footer {
			height: 48px;
			padding: 0 0.3rem;
		}
		.footer-logo {
			width: 20px;
			height: 20px;
		}
	}
</style>
