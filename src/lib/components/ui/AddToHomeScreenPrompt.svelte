<script lang="ts">
	import { onMount } from 'svelte';
	let deferredPrompt: any = null;
	let showPrompt = false;

	function isMobileDevice() {
		// Basic check: user agent or screen width
		return (
			typeof window !== 'undefined' &&
			(/Mobi|Android|iPhone|iPad|iPod|Opera Mini|IEMobile|BlackBerry/i.test(navigator.userAgent) ||
				window.innerWidth <= 800)
		);
	}

	onMount(() => {
		window.addEventListener('beforeinstallprompt', (e) => {
			if (!isMobileDevice()) return;
			e.preventDefault();
			deferredPrompt = e;
			showPrompt = true;
		});
	});

	async function addToHomeScreen() {
		if (deferredPrompt) {
			deferredPrompt.prompt();
			const { outcome } = await deferredPrompt.userChoice;
			if (outcome === 'accepted') {
				showPrompt = false;
			}
			deferredPrompt = null;
		}
	}

	function closePrompt() {
		showPrompt = false;
	}
</script>

{#if showPrompt}
	<div class="a2hs-popup">
		<span class="a2hs-text">Add Bim to your homepage</span>
		<button class="a2hs-add" on:click={addToHomeScreen}>Add</button>
		<button class="a2hs-dismiss" on:click={closePrompt}>Dismiss</button>
	</div>
{/if}

<style>
	.a2hs-popup {
		position: fixed;
		left: 50%;
		bottom: 2rem;
		transform: translateX(-50%);
		background: var(--color-surface, #2a2a2a) !important;
		padding: 1rem 1.5rem;
		display: flex;
		gap: 1rem;
		align-items: center;
		z-index: 1000;
		max-width: 270px;
		min-width: 190px;
		width: auto;
	}
	.a2hs-text {
		color: var(--color-text-light);
		text-align: left;
		font-size: 0.95rem;
	}
	.a2hs-add {
		background: #fff !important;
		color: #000;
		padding: 0.5rem 1rem;
		cursor: pointer;
	}
	.a2hs-dismiss {
		background: #000;
		color: #fff;
		padding: 0.5rem 1rem;
		cursor: pointer;
	}
</style>
