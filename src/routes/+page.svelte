<!--
  @component
  Main Application Page - WebAuthn Starknet Account Deployment
  
  This is the primary landing page for the WebAuthn Starknet account 
  deployment system. With the new layout structure, this page focuses
  solely on the authenticated user experience:
  
  - Account deployment interface for authenticated users
  - Lightning Network swap functionality
  - Welcome message and user guidance
  - Integration with AVNU paymaster for gasless deployment
  
  The authentication interface is now handled by the root layout,
  ensuring consistent user experience across all pages and proper
  SSR/client-side hydration.
  
  @requires $lib/stores/auth - User authentication state management
  @requires $lib/components/account/AccountDeployment - Account deployment interface
  @requires $lib/components/lightning/StarknetToLightning - Lightning swap interface
  @requires $lib/components/ui/Card - UI card component
  
  @author bim
  @version 1.0.0
-->

<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import LoadingSpinner from '$lib/components/ui/LoadingSpinner.svelte';
	import { currentUser, logout } from '$lib/stores/auth';
	import { i18nReady as i18nReadyStore } from '$lib/stores/i18n';
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';

	// Get layout data
	export let data;

	// Set initial user state from SSR data if available
	if (data?.user && !$currentUser) {
		console.log('Setting user from SSR data:', data.user);
		currentUser.set(data.user);
	}

	// Function to check and redirect authenticated users
	function checkAndRedirect() {
		if (browser && $page.url.pathname === '/') {
			const user = $currentUser || data?.user;
			console.log(
				'Redirect check - currentUser:',
				$currentUser,
				'data.user:',
				data?.user,
				'combined user:',
				user
			);

			// Check for force logout parameter
			if ($page.url.searchParams.get('logout') === 'true') {
				console.log($_('debug.force_logout_detected'));
				logout();
			} else if (user) {
				console.log($_('debug.user_authenticated_redirecting'));
				// Use replaceState to avoid stacking history entries
				goto('/homebis', { replaceState: true });
			}
		}
	}

	// Reactive redirect when user is authenticated - check both store and SSR data
	$: if (browser && $page.url.pathname === '/') {
		checkAndRedirect();
	}

	// Also check on mount to handle cases where reactive statement doesn't trigger
	onMount(() => {
		// Small delay to ensure all stores are properly initialized
		setTimeout(() => {
			checkAndRedirect();
		}, 100);

		// Additional check after a longer delay to handle cases where user state is set later
		setTimeout(() => {
			checkAndRedirect();
		}, 1000);

		// Check every 2 seconds until redirect happens or user is not authenticated
		const redirectInterval = setInterval(() => {
			const user = $currentUser || data?.user;
			if (user) {
				console.log($_('debug.periodic_redirect_check'));
				goto('/homebis', { replaceState: true });
				clearInterval(redirectInterval);
			}
		}, 2000);

		// Clean up interval after 30 seconds
		setTimeout(() => {
			clearInterval(redirectInterval);
		}, 30000);
	});
</script>

<svelte:head>
	<title>{$_('meta.title')}</title>
	<meta name="description" content={$_('meta.description')} />
</svelte:head>

<main>
	<!-- Main page is now just for authentication -->
	<!-- Authenticated users are redirected to /homebis -->
	{#if browser && ($currentUser || data?.user)}
		<div class="redirecting">
			<LoadingSpinner size="large" color="white" centered />
			<p>{$i18nReadyStore ? $_('loading.app') : $_('loading.redirecting')}</p>
		</div>
	{/if}
</main>

<style>
	/* Main page styles - minimal since content is handled by layout */
	.redirecting {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 50vh;
		color: #b0b0b0;
		gap: 12px;
	}
</style>
