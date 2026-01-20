<script lang="ts">
	import { browser } from '$app/environment';
	import LightningReceive from '$lib/components/lightning/LightningReceive.svelte';
	import { _ } from 'svelte-i18n';
	import SuccessIndicator from '$lib/components/ui/SuccessIndicator.svelte';
	import { currentUser } from '$lib/stores/auth';
	import { i18nReady as i18nReadyStore } from '$lib/stores/i18n';
	import { useAccountDeployment } from '$lib/composables/useAccountDeployment';
	import type { SwapStatus } from '$lib/services/client/lightning.client.service';
	import { goto, beforeNavigate } from '$app/navigation';
	import { onMount, onDestroy } from 'svelte';
	import { criticalFlow, isSigning } from '$lib/stores/navigation-guard';

	// Redirect non-logged-in users
	$: if (browser && !$currentUser) {
		goto('/');
	}

	// Redirect users without WebAuthn credentials
	$: if (browser && $currentUser && (!$currentUser.credentialId || !$currentUser.publicKey)) {
		goto('/');
	}

	// Get account deployment state - only when user is authenticated and on client side
	let state: any = null;
	$: if (browser && $currentUser && $currentUser.credentialId && $currentUser.publicKey) {
		const { state: accountState } = useAccountDeployment($currentUser);
		state = accountState;
	}

	// Get the starknet address from the account state
	$: starknetAddress = $state?.accountAddress || '';

	// Success indicator state
	let showPageLevelSuccess = false;

	// Navigation guard state
	let navigationLocked = false;
	let unsubscribeGuard: (() => void) | null = null;
	let unsubscribeSigning: (() => void) | null = null;
	let beforeUnloadHandler: ((e: BeforeUnloadEvent) => void) | null = null;

	function handleBackClick(event: MouseEvent) {
		if (navigationLocked) {
			event.preventDefault();
			event.stopPropagation();
			return;
		}
		// Use client-side navigation when unlocked
		if (browser) goto('/homebis');
	}

	if (browser) {
		onMount(() => {
			// Subscribe to critical flow store and signing activity
			let latestCritical = false;
			let latestSigning = false;
			const recompute = () => (navigationLocked = latestCritical || latestSigning);

			unsubscribeGuard = criticalFlow.subscribe((s) => {
				latestCritical = !!s.active;
				recompute();
			});
			unsubscribeSigning = isSigning.subscribe((active) => {
				latestSigning = !!active;
				recompute();
			});

			// Cancel client-side navigation when locked
			beforeNavigate((nav) => {
				if (navigationLocked) {
					nav.cancel();
				}
			});

			// Warn on reload/close when locked
			beforeUnloadHandler = (e: BeforeUnloadEvent) => {
				if (navigationLocked) {
					e.preventDefault();
					e.returnValue = '';
				}
			};
			window.addEventListener('beforeunload', beforeUnloadHandler);
		});

		onDestroy(() => {
			if (unsubscribeGuard) unsubscribeGuard();
			if (unsubscribeSigning) unsubscribeSigning();
			if (beforeUnloadHandler) {
				window.removeEventListener('beforeunload', beforeUnloadHandler);
			}
		});
	}

	// Debug reactive statement to track success indicator state
	$: {
		console.log('🔍 Page: showPageLevelSuccess state changed:', showPageLevelSuccess);
	}

	// Handle payment completion
	function handlePaymentComplete(status: SwapStatus) {
		console.log('Payment completed with status:', status);

		// Show success indicator when payment is completed
		if (status.status === 'completed') {
			console.log('🎉 Page: Showing success indicator for completed payment');
			showPageLevelSuccess = true;
		}
	}

	// Handle errors
	function handleError(error: string) {
		console.error('Payment error:', error);
		// You could show an error toast or redirect here
	}

	// Handle success indicator hide
	function handlePageSuccessHide() {
		console.log('🎭 Page: Success indicator hidden');
		showPageLevelSuccess = false;
		// After the success indicator completes, return to dashboard
		if (browser) {
			goto('/homebis');
		}
	}

	// Handle Lightning claim success (custom event from LightningCard)
	function handleLightningClaimSuccess(event: CustomEvent) {
		console.log('⚡ Page: Lightning claim success event received:', event.detail);
		showPageLevelSuccess = true;
	}
</script>

<main class="receive-page">
	<div class="container">
		<div class="header">
			<h1>{$i18nReadyStore ? $_('title') : 'Receive Bitcoin'}</h1>
		</div>

		{#if !$currentUser || !$currentUser.credentialId || !$currentUser.publicKey}
			<div class="loading">
				<p>{$i18nReadyStore ? $_('loading') : 'Loading...'}</p>
			</div>
		{:else if starknetAddress}
			<LightningReceive
				{starknetAddress}
				onPaymentComplete={handlePaymentComplete}
				onError={handleError}
				initiallyVisible={true}
				on:lightningClaimSuccess={handleLightningClaimSuccess}
			/>
		{:else}
			<div class="loading">
				<p>{$i18nReadyStore ? $_('loading_address') : 'Loading address...'}</p>
			</div>
		{/if}

		<div class="back-link">
			<a
				href="/homebis"
				on:click={handleBackClick}
				aria-disabled={navigationLocked}
				class:disabled={navigationLocked}
				title={navigationLocked
					? 'Claim in progress – please stay on this page'
					: $i18nReadyStore
						? $_('back_title')
						: 'Back to Dashboard'}
			>
				{$i18nReadyStore ? $_('back') : '← Back to Dashboard'}
			</a>
			{#if navigationLocked}
				<div class="lock-hint">
					{$i18nReadyStore ? $_('claim_progress') : "Claim in progress — don't leave this page"}
				</div>
			{/if}
		</div>
	</div>
</main>

<!-- Page-level Success Indicator -->
<SuccessIndicator
	visible={showPageLevelSuccess}
	message="Lightning payment received!"
	position="center"
	onHide={handlePageSuccessHide}
/>

<style>
	.receive-page {
		min-height: 100vh;
		background: var(--color-background, #121413);
		color: var(--color-text, #ffffff);
		padding: 20px;
	}

	.container {
		max-width: 600px;
		margin: 0 auto;
	}

	.header {
		text-align: center;
		margin-bottom: 40px;
	}

	.header h1 {
		font-size: 2.5rem;
		font-weight: 700;
		margin: 0 0 16px 0;
		background: linear-gradient(90deg, #824d07, #f69413);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.subtitle {
		font-size: 1.1rem;
		color: #cacaca;
		line-height: 1.5;
		margin: 0;
	}

	.loading,
	.error {
		text-align: center;
		padding: 40px 20px;
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.05);
		margin: 20px 0;
	}

	.error {
		background: rgba(244, 67, 54, 0.1);
		border: 1px solid #f44336;
	}

	.error p {
		color: #f44336;
		margin: 0;
	}

	.loading p {
		color: #cacaca;
		margin: 0;
	}

	.back-link {
		text-align: center;
		margin-top: 40px;
	}

	.back-link a {
		color: var(--color-primary, #f69413);
		text-decoration: none;
		font-weight: 500;
		font-size: 1rem;
		transition: opacity 0.2s ease;
	}

	.back-link a.disabled {
		opacity: 0.5;
		pointer-events: none;
		cursor: not-allowed;
	}

	.back-link a:hover {
		opacity: 0.8;
	}

	.lock-hint {
		margin-top: 8px;
		font-size: 0.9rem;
		color: #cacaca;
	}

	/* Mobile responsive */
	@media (max-width: 768px) {
		.receive-page {
			padding: 16px;
		}

		.header h1 {
			font-size: 2rem;
		}

		.subtitle {
			font-size: 1rem;
		}

		.container {
			max-width: 100%;
		}
	}

	/* High contrast mode */
	@media (prefers-contrast: high) {
		.loading,
		.error {
			border: 2px solid rgba(255, 255, 255, 0.3);
		}
	}

	/* Reduced motion */
	@media (prefers-reduced-motion: reduce) {
		.back-link a {
			transition: none;
		}
	}
</style>
