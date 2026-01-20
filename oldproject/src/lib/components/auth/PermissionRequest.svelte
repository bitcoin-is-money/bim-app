<script lang="ts">
	import { onMount } from 'svelte';

	export let onPermissionsGranted: () => void = () => {};
	export let onPermissionsDenied: () => void = () => {};

	onMount(() => {
		// Don't show any permission requests on initial load
		// Camera permissions will be handled contextually when user tries to scan QR codes
	});
</script>

<!-- This component is now empty since we don't want to request any permissions upfront -->
<!-- Camera permissions will be handled by the QR scanner component when needed -->
