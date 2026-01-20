<script lang="ts">
	import { onMount } from 'svelte';
	import { getInitializationStatus } from '$lib/i18n';
	import { locale } from 'svelte-i18n';

	export let fallback: string = '';
	export let translationKey: string = '';

	let i18nReady = false;
	let currentLocale: string | null = null;

	onMount(() => {
		// Check initial status
		i18nReady = getInitializationStatus();

		// Subscribe to locale changes
		const unsubscribe = locale.subscribe((loc) => {
			if (loc) {
				currentLocale = loc;
				i18nReady = true;
			}
		});

		return unsubscribe;
	});
</script>

{#if i18nReady && currentLocale}
	<slot />
{:else}
	{fallback}
{/if}
