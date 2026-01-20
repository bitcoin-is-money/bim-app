<header class="header header-bar">
	<div class="header-section header-left logo-bg">
		<slot name="left"></slot>
	</div>
	<div class="header-section header-right">
		<slot name="right"></slot>
	</div>
</header>

<style>
	.header {
		position: relative;
		width: 100%;
		height: 56px;
		background: var(--color-background);
		color: var(--color-text);
		display: flex;
		align-items: center;
		box-shadow: var(--shadow-sm);
		z-index: 1000;
		padding: 0 var(--space-md);
		padding-top: 32px;
	}
	.header-bar {
		justify-content: space-between;
	}
	.header-section {
		display: flex;
		align-items: center;
		min-width: 0;
	}
	.header-left.logo-bg {
		background: var(--color-background);
		padding: 0.25rem 0.75rem;
		border-radius: var(--radius-md);
		height: 100%;
		display: flex;
		align-items: center;
	}
	.header-right {
		gap: 8px;
	}
	@media (max-width: 600px) {
		.header {
			height: 48px;
			padding: 0 var(--space-sm);
		}
	}
</style>
