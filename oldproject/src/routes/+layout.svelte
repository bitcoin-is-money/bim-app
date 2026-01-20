<!--
  @component
  Root Layout - WebAuthn Starknet Account Deployment
  
  This is the root layout component that wraps all pages in the application.
  It provides the global application structure and handles:
  
  - Global CSS and styling
  - Authentication container (shown on all pages)
  - SEO meta tags and document head
  - Error boundaries and loading states
  - Consistent user experience across routes
  
  The layout implements proper SvelteKit template inheritance, ensuring
  that global components and styles are properly shared across all pages
  without duplication or client-side flashing.
  
  @requires $lib/stores/auth - User authentication state management
  @requires $lib/components/auth/AuthContainer - Global authentication UI
  @requires $lib/components/ui/LoadingSpinner - Loading state indicator
  
  @author bim
  @version 1.0.0
-->

<script lang="ts">
	import { browser } from '$app/environment';
	import { page } from '$app/stores';
	import AuthContainer from '$lib/components/auth/AuthContainer.svelte';
	import OnboardingFlow from '$lib/components/onboarding/OnboardingFlow.svelte';
	import AddToHomeScreenPrompt from '$lib/components/ui/AddToHomeScreenPrompt.svelte';
	import LoadingSpinner from '$lib/components/ui/LoadingSpinner.svelte';
	import { waitForI18n } from '$lib/i18n';
	import { WebauthnAccountService } from '$lib/services/client/webauthn-account.service';
	import { currentUser } from '$lib/stores/auth';
	import { i18nReady as i18nReadyStore, setI18nReady } from '$lib/stores/i18n';
	import { starknetAccountAddress } from '$lib/stores/starknet';
	import Footer from '$lib/ui/Footer.svelte';
	import Header from '$lib/ui/Header.svelte';
	import { onMount } from 'svelte';
	import { locale, t } from 'svelte-i18n';

	// Get layout data from the load function
	export let data;

	// Debug: Log initial locale from server
	console.log(`[DEBUG] Initial locale from server: ${data?.locale}`);

	// Set initial user state from SSR data
	if (data?.user && !$currentUser) {
		currentUser.set(data.user);
	}

	// Prefer user-provided Starknet address if available
	$: if ($currentUser?.starknetAddress && !$starknetAccountAddress) {
		starknetAccountAddress.set($currentUser.starknetAddress);
	}

	// Compute and cache Starknet address globally if not set yet
	onMount(async () => {
		try {
			if ($currentUser && !$starknetAccountAddress) {
				const service = new WebauthnAccountService();
				const computed = await service.calculateAccountAddress($currentUser);
				if (computed && computed.startsWith('0x')) {
					starknetAccountAddress.set(computed);
					// Also ensure currentUser carries the address for services that rely on it
					if (!$currentUser.starknetAddress) {
						currentUser.set({ ...$currentUser, starknetAddress: computed });
					}
				}
			}
		} catch (e) {
			console.warn('Could not precompute Starknet address in layout:', e);
		}

		// Initialize i18n on client side with server-provided locale
		try {
			const { initializeI18n } = await import('$lib/i18n');
			await initializeI18n(data?.locale || 'en');
			// Use verification instead of immediate ready
			waitAndSetI18nReady();
			console.log('[DEBUG] i18n initialized successfully on client');
		} catch (error) {
			console.warn('Failed to initialize i18n on client:', error);
			// Fallback: try to get initialization status
			const { getInitializationStatus } = await import('$lib/i18n');
			if (getInitializationStatus()) {
				waitAndSetI18nReady();
			}
		}

		// Subscribe to locale changes to track i18n readiness
		const unsubscribe = locale.subscribe((loc: string | null) => {
			if (loc) {
				waitAndSetI18nReady();
			}
		});

		return unsubscribe;
	});

	// Check if we're on the about-bim, home, payment-demo, lightning/receive, settings, or pay route
	$: isAboutBimOrHome =
		$page.url.pathname.startsWith('/about-bim') ||
		$page.url.pathname.startsWith('/homebis') ||
		$page.url.pathname.startsWith('/payment-demo') ||
		$page.url.pathname.startsWith('/receive') ||
		$page.url.pathname.startsWith('/Settings') ||
		$page.url.pathname.startsWith('/pay');

	// Safety check: ensure i18n is ready before using translations
	// This prevents the "Cannot format a message without first setting the initial locale" error
	$: if (browser && !$i18nReadyStore && data?.locale) {
		// Try to initialize i18n if it's not ready but we have a locale
		import('$lib/i18n').then(({ initializeI18n, getInitializationStatus }) => {
			// Check if already initialized but store not updated
			if (getInitializationStatus()) {
				setI18nReady(true);
				console.log('[DEBUG] i18n was already initialized, setting store ready');
				return;
			}

			initializeI18n(data.locale)
				.then(() => {
					waitAndSetI18nReady();
					console.log('[DEBUG] i18n initialized from safety check');
				})
				.catch((error) => {
					console.warn('[DEBUG] Failed to initialize i18n from safety check:', error);
					// Force i18n ready to prevent infinite loading
					setI18nReady(true);
				});
		});
	}

	// Helper function to wait for i18n to be ready
	async function waitAndSetI18nReady() {
		try {
			// Wait for i18n to be fully initialized using the existing promise
			await waitForI18n();

			// Verify that translations are actually available
			let attempts = 0;
			const maxAttempts = 10;

			while (attempts < maxAttempts) {
				try {
					// Test multiple namespaces to ensure all translations are loaded
					const payTranslation = $t('pay.header.title');
					const actionsReceive = $t('actions.receive');
					const actionsPay = $t('actions.pay');
					const toggleHide = $t('toggle.hide');
					const commonNext = $t('next');
					const commonProcess = $t('process');

					if (
						payTranslation &&
						payTranslation !== 'pay.header.title' &&
						actionsReceive &&
						actionsReceive !== 'actions.receive' &&
						actionsPay &&
						actionsPay !== 'actions.pay' &&
						toggleHide &&
						toggleHide !== 'toggle.hide' &&
						commonNext &&
						commonNext !== 'next' &&
						commonProcess &&
						commonProcess !== 'process'
					) {
						// All critical translations are working
						break;
					}
				} catch (e) {
					// Translation not ready yet
				}

				await new Promise((resolve) => setTimeout(resolve, 100));
				attempts++;
			}

			// Set ready - the i18n system should be working now
			setI18nReady(true);
			console.log(`[DEBUG] i18n ready with locale: ${$locale}, attempts: ${attempts}`);
		} catch (error) {
			console.error('[DEBUG] Error during i18n initialization:', error);
			// Set ready anyway to prevent blocking the UI
			setI18nReady(true);
		}
	}

	// Check if we should show auth container (hide it if user is authenticated on root page)
	$: shouldShowAuthContainer =
		!isAboutBimOrHome && !($page.url.pathname === '/' && ($currentUser || data?.user));
</script>

<!--
  Document Head - SEO and Meta Tags
  
  Provides proper SEO optimization and meta tags for the application.
  These are applied to all pages unless overridden by page-specific head blocks.
-->
<svelte:head>
	<title>{!browser || $i18nReadyStore ? $t('meta.title') : 'Bim - Bitcoin on Starknet'}</title>
	<meta
		name="description"
		content={!browser || $i18nReadyStore
			? $t('meta.description')
			: 'Bim is a minimalist app to receive and pay in Bitcoin on Starknet'}
	/>
	<meta
		name="keywords"
		content="WebAuthn, Starknet, Account Deployment, Passkey, Blockchain, Gasless"
	/>
	<meta name="author" content="Adrien" />

	<!-- Open Graph / Social Media -->
	<meta property="og:type" content="website" />
	<meta
		property="og:title"
		content={!browser || $i18nReadyStore ? $t('meta.title') : 'Bim - Bitcoin on Starknet'}
	/>
	<meta
		property="og:description"
		content={!browser || $i18nReadyStore
			? $t('meta.description')
			: 'Bim is a minimalist app to receive and pay in Bitcoin on Starknet'}
	/>

	<!-- Progressive Web App -->
	<meta name="theme-color" content="#121212" />
	<meta name="mobile-web-app-capable" content="yes" />
	<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
</svelte:head>

{#if shouldShowAuthContainer}
	<Header>
		<img slot="left" src="/logo-baseline.png" alt="Bim_Logo" style="height:48px;" />
		<div slot="right">
			<!-- Language selector moved to Settings page -->
		</div>
	</Header>

	<section class="header-bg-gap">
		<h1 class="header-bg-title">
			{!browser || $i18nReadyStore
				? $t('header.tagline')
				: "Pay and receive in Bitcoin. That's it."}
		</h1>
	</section>
{/if}

<!--
  Global Application Structure
  
  Provides the consistent layout structure for all pages:
  1. Authentication container (always visible)
  2. Main content area (page-specific content)
  3. Loading states and error boundaries
-->
<main class="app">
	<!-- 
    Global Authentication Container
    
    Always rendered to provide consistent authentication interface
    across all pages. Handles login/register/logout functionality
    and user profile display.
  -->
	{#if shouldShowAuthContainer}
		<AuthContainer />
	{/if}

	<!--
    Page Content Slot
    
    This is where individual page content gets rendered.
    Each page's content will be inserted here while maintaining
    the global layout structure.
  -->
	<div class="page-content">
		{#if data?.loading}
			<div class="loading-container">
				<LoadingSpinner size="large" />
				<p>{$i18nReadyStore ? $t('loading.app') : 'Loading...'}</p>
			</div>
		{:else if $i18nReadyStore}
			<slot />
		{:else}
			<div class="loading-container">
				<LoadingSpinner size="large" />
				<p>Initializing translations...</p>
			</div>
		{/if}
	</div>
</main>

{#if shouldShowAuthContainer}
	<Footer />
{/if}

<!-- PWA Install Prompt -->
<AddToHomeScreenPrompt />

<!-- Onboarding Flow -->
<OnboardingFlow />

<!--
  Global Styles
  
  Base application styles that apply to the entire application.
  These styles provide the foundation for the dark theme and
  responsive design system.
-->
<style>
	/* Global app container */
	:global(body) {
		margin: 0;
		padding: 0;
		text-align: center;
		font-family:
			-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Fira Sans',
			'Droid Sans', 'Helvetica Neue', sans-serif;
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: grayscale;
		background: #121212;
		color: #fff;
		min-height: 100vh;
	}

	/* Main app container */
	.app {
		max-width: 1200px;
		margin: 0 auto;
		padding: 0;
	}

	/* Page content container */
	.page-content {
		margin-top: 20px;
	}

	/* Loading state container */
	.loading-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 16px;
		min-height: 200px;
		color: #b0b0b0;
	}

	.loading-container p {
		margin: 0;
		font-size: 14px;
		font-style: italic;
	}

	/* Responsive design adjustments */
	@media (max-width: 767px) {
		:global(body) {
			padding: 0;
		}

		.page-content {
			margin-top: 15px;
		}
	}

	/* Focus and accessibility improvements */
	:global(*:focus) {
		outline: 2px solid #ffffffff;
		outline-offset: 2px;
	}

	/* Ensure proper color contrast for accessibility */
	:global(::selection) {
		background: #ffffffff;
		color: #fff;
	}

	.header-bg-gap {
		width: 100%;
		min-height: 62px;
		padding-top: 24px;
		padding-bottom: 12px;
		background: var(--color-background);
		display: flex;
		align-items: center;
		justify-content: flex-start;
		padding-left: var(--space-md);
		margin-bottom: 32px;
	}
	.header-bg-title {
		color: var(--color-text);
		font-size: 2.5rem;
		font-weight: 900;
		margin: 0;
		text-align: left;
	}
</style>
