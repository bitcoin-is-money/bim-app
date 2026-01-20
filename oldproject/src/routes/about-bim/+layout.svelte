<script>
	export const reset = true;
	import Header from '$lib/ui/Header.svelte';
</script>

<Header />
<slot />

<style>
	/* Full screen container that doesn't affect global body/html */
	.about-bim {
		width: 100vw;
		height: 100vh;
		margin: 0;
		padding: 2rem;
		background: var(--color-surface, #fff);
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		position: fixed;
		top: 0;
		left: 0;
		z-index: 1000;
		overflow: hidden;
	}

	.back-arrow {
		margin-top: 2rem;
		margin-left: 1.5rem;
		align-self: flex-start;
		justify-self: left;
		font-size: 2rem;
		background: none;
		border: none;
		color: #fff;
		font-weight: bold;
		cursor: pointer;
		transition: color 0.2s;
	}
	.back-arrow:hover {
		color: var(--color-primary, #0070f3);
	}
	h1 {
		font-size: 2rem;
		margin-bottom: 1rem;
	}
	p {
		font-size: 1.1rem;
		color: var(--color-text-light, #444);
	}
</style>
