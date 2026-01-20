<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import Card from '$lib/components/ui/Card.svelte';
	import { useAccountDeployment } from '$lib/composables/useAccountDeployment';
	import { PricingOrchestrator } from '$lib/services/client/pricing/pricing-orchestrator';
	import type { PriceData } from '$lib/services/client/pricing/types';
	import { userTransactionService } from '$lib/services/client/user-transaction.service';
	import type { SupportedCurrency } from '$lib/services/server/user-settings.service';
	import { currentUser } from '$lib/stores/auth';
	import { i18nReady as i18nReadyStore } from '$lib/stores/i18n';
	import type { Currency, Transaction } from '$lib/types/wallet-dashboard';
	import { onDestroy, onMount } from 'svelte';
	import { t } from 'svelte-i18n';

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
	let checkDeploymentStatus: any = null;
	$: if (browser && $currentUser && $currentUser.credentialId && $currentUser.publicKey) {
		const result = useAccountDeployment($currentUser);
		state = result.state;
		checkDeploymentStatus = result.checkDeploymentStatus;
	}

	// Component state
	let currentCurrency: Currency = 'BTC'; // Default to BTC (sats)
	let showBanner = true;
	let btcPrice: PriceData | null = null;
	let priceLoading = false;
	let userFiatCurrency: SupportedCurrency = 'USD'; // Default to USD, loaded from settings
	let settingsLoading = false;
	let refreshInterval: ReturnType<typeof setInterval> | null = null;

	// Transaction state
	let transactions: Transaction[] = [];
	let transactionsLoading = false;
	let transactionsError = '';

	// Pricing service instance - only create when in browser
	let pricingService: any = null;
	$: if (browser) {
		pricingService = PricingOrchestrator.getInstance();
	}

	// Get real balance from account status and parse sats
	$: realBalance = $state?.accountStatus?.balance;
	$: satsAmount =
		realBalance && realBalance !== 'Balance unavailable'
			? parseFloat(realBalance.replace(/[^\d.-]/g, '')) || 0
			: 0;

	// Reactive statement to start periodic refresh for new users
	$: if (
		checkDeploymentStatus &&
		$state?.accountStatus?.isDeployed &&
		(!$state?.accountStatus?.balance || $state?.accountStatus?.balance === 'Balance unavailable')
	) {
		// Start periodic refresh if account is deployed but has no balance
		if (!refreshInterval) {
			startPeriodicRefresh();
		}
	} else if (
		checkDeploymentStatus &&
		$state?.accountStatus?.balance &&
		$state?.accountStatus?.balance !== 'Balance unavailable'
	) {
		// Stop periodic refresh if balance is available
		stopPeriodicRefresh();
	}

	// Convert sats to fiat if needed
	$: fiatAmount = btcPrice ? (satsAmount / 100_000_000) * btcPrice.usdPrice : 0;

	// Current display amount based on selected currency
	$: displayAmount = currentCurrency === 'BTC' ? satsAmount : fiatAmount;

	// Track user ID to avoid infinite loops
	let currentUserId: string | null = null;

	// Reactive statement to reload transactions when user changes
	$: if ($currentUser && $currentUser.id !== currentUserId && checkDeploymentStatus) {
		currentUserId = $currentUser.id;
		loadUserTransactions();
	}

	// Format balance display based on currency type
	function formatBalance(amount: number, currencyCode: Currency): string {
		if (currencyCode === 'BTC') {
			// Format sats with thousands separators
			return new Intl.NumberFormat('en-US', {
				style: 'decimal',
				minimumFractionDigits: 0,
				maximumFractionDigits: 0
			}).format(Math.abs(amount));
		} else {
			// Format fiat currency with 2 decimal places
			return new Intl.NumberFormat('en-US', {
				style: 'decimal',
				minimumFractionDigits: 2,
				maximumFractionDigits: 2
			}).format(Math.abs(amount));
		}
		return amount.toString();
	}

	// Get transaction status icon
	function getTransactionIcon(transaction: Transaction): string {
		if (transaction.type === 'credit') return '●';
		if (transaction.description.toLowerCase().includes('coffee')) return '●';
		return '●';
	}

	// Get transaction icon color class
	function getTransactionIconColor(transaction: Transaction): string {
		if (transaction.type === 'credit') return 'text-green-500';
		if (transaction.description.toLowerCase().includes('coffee')) return 'text-red-500';
		return 'text-red-500';
	}

	// Navigation handlers
	function handleReceive() {
		// Navigate to receive page
		window.location.href = '/receive';
	}

	function handlePay() {
		// Navigate to payment method selector
		window.location.href = '/payment-demo';
	}

	async function toggleCurrency() {
		if (!pricingService) return;

		if (currentCurrency === 'BTC') {
			// Switch to user's preferred fiat, fetch BTC price if not already available
			if (!btcPrice && !priceLoading) {
				priceLoading = true;
				try {
					btcPrice = await pricingService.getPrice('WBTC');
				} catch (error) {
					console.error('Failed to fetch BTC price:', error);
				} finally {
					priceLoading = false;
				}
			}
			currentCurrency = userFiatCurrency as Currency;
		} else {
			// Switch back to BTC (sats)
			currentCurrency = 'BTC';
		}
	}

	function openSettings() {
		goto('/Settings');
	}

	async function loadUserSettings() {
		if (settingsLoading) return;

		settingsLoading = true;
		try {
			const response = await fetch('/api/user/settings');
			if (response.ok) {
				const result = await response.json();
				if (result.success && result.data?.fiatCurrency) {
					userFiatCurrency = result.data.fiatCurrency;
				}
			} else {
				console.warn('Failed to load user settings, using default USD');
			}
		} catch (error) {
			console.error('Error loading user settings:', error);
			// Keep default USD on error
		} finally {
			settingsLoading = false;
		}
	}

	async function loadUserTransactions() {
		if (transactionsLoading || !$currentUser || !checkDeploymentStatus) return;

		transactionsLoading = true;
		transactionsError = '';
		try {
			// Fetch the last 5 transactions
			const userTransactions = await userTransactionService.getRecentTransactions(5);
			transactions = userTransactions;
			console.log('Loaded user transactions:', transactions.length);
		} catch (error) {
			console.error('Error loading user transactions:', error);
			transactionsError = error instanceof Error ? error.message : 'Failed to load transactions';
			// Keep empty array on error
			transactions = [];
		} finally {
			transactionsLoading = false;
		}
	}

	// Automatic refresh function
	async function refreshBalance() {
		if (!checkDeploymentStatus) return;

		try {
			await checkDeploymentStatus();
			console.log('Balance refreshed automatically');
		} catch (error) {
			console.error('Failed to refresh balance:', error);
		}
	}

	// Start periodic refresh for new users
	function startPeriodicRefresh() {
		if (refreshInterval || !checkDeploymentStatus) return;

		// Refresh every 2 seconds for the first 2 minutes (for new users)
		refreshInterval = setInterval(async () => {
			if (
				$state?.accountStatus?.isDeployed &&
				$state?.accountStatus?.balance &&
				$state?.accountStatus?.balance !== 'Balance unavailable'
			) {
				// If account is deployed and has a balance, stop the periodic refresh
				stopPeriodicRefresh();
				return;
			}

			await refreshBalance();
		}, 2000);

		// Stop periodic refresh after 2 minutes
		setTimeout(() => {
			stopPeriodicRefresh();
		}, 120000);
	}

	// Stop periodic refresh
	function stopPeriodicRefresh() {
		if (refreshInterval) {
			clearInterval(refreshInterval);
			refreshInterval = null;
		}
	}

	onMount(async () => {
		// Load user data and balance in real implementation
		console.log('Homebis dashboard loaded');

		// Load user settings for preferred fiat currency
		await loadUserSettings();

		// Load user transactions
		if ($currentUser) {
			await loadUserTransactions();
		}

		// Pre-fetch BTC price for faster fiat conversion
		if (!btcPrice && pricingService) {
			try {
				btcPrice = await pricingService.getPrice('WBTC');
			} catch (error) {
				console.error('Failed to pre-fetch BTC price:', error);
			}
		}

		// Start periodic refresh for new users (only if composable is available)
		if (
			checkDeploymentStatus &&
			$state?.accountStatus?.isDeployed &&
			(!$state?.accountStatus?.balance || $state?.accountStatus?.balance === 'Balance unavailable')
		) {
			startPeriodicRefresh();
		}
	});

	onDestroy(() => {
		stopPeriodicRefresh();
	});
</script>

<svelte:head>
	<title>{$i18nReadyStore ? $t('head.title') : 'Home - BIM Wallet'}</title>
	<meta
		name="description"
		content={$i18nReadyStore ? $t('head.description') : 'Your WebAuthn Starknet wallet dashboard'}
	/>
</svelte:head>

<main class="homebis-dashboard">
	{#if !$currentUser || !$currentUser.credentialId || !$currentUser.publicKey}
		<div class="loading-container">
			<div class="loading-spinner">
				{$i18nReadyStore ? $t('loading.loading') : 'Loading...'}
			</div>
		</div>
	{:else if !checkDeploymentStatus}
		<div class="loading-container">
			<div class="loading-spinner">
				{$i18nReadyStore ? $t('loading.initializing_wallet') : 'Initializing wallet...'}
			</div>
		</div>
	{:else if !$state}
		<div class="loading-spinner">
			{$i18nReadyStore ? $t('loading.loading_wallet_state') : 'Loading wallet state...'}
		</div>
	{:else if showBanner && satsAmount === 0}
		<div class="banner-notification">
			<p>
				{$i18nReadyStore
					? $t('banner.zero_balance')
					: 'Your balance is 0. Pay from another wallet, tap receive!'}
			</p>
			<button
				class="close-banner"
				aria-label={$i18nReadyStore ? $t('banner.close_notification') : 'Close notification'}
				on:click={() => (showBanner = false)}
			>
				&times;
			</button>
		</div>
	{/if}

	<!-- Welcome Header -->
	<div class="welcome-header">
		<div
			class="welcome-content"
			on:click={openSettings}
			on:keydown={(e) => e.key === 'Enter' && openSettings()}
			role="button"
			tabindex="0"
			style="cursor:pointer;"
		>
			<span class="settings-icon">
				<img
					src="/settings-icon.png"
					alt={$i18nReadyStore ? $t('welcome.settings') : 'Settings'}
					width="24"
					height="24"
				/>
			</span>
			<span class="welcome-text">
				{$t('welcome.hello', { values: { username: $currentUser?.username || 'User' } })}
			</span>
		</div>
	</div>

	<!-- Balance Display -->
	<div class="balance-section">
		<div class="balance-card-wrapper">
			<Card variant="elevated" background="primary" padding="large" className="balance-card">
				<div class="balance-display">
					<button
						class="balance-amount"
						on:click={toggleCurrency}
						aria-label={$t('balance.toggle_currency')}
						disabled={priceLoading}
					>
						{#if priceLoading && currentCurrency !== 'BTC'}
							{$t('loading.loading')}
						{:else if realBalance && realBalance !== 'Balance unavailable'}
							{#if currentCurrency !== 'BTC' && !btcPrice}
								{$t('loading.price_unavailable')}
							{:else}
								{formatBalance(displayAmount, currentCurrency)}
							{/if}
						{:else}
							{realBalance || $t('loading.loading')}
						{/if}
					</button>
				</div>
			</Card>
		</div>

		<!-- Currency Button - Outside Card -->
		<div class="currency-button-container">
			<button
				class="currency-button"
				on:click={toggleCurrency}
				aria-label={$t('balance.change_currency')}
				disabled={priceLoading}
			>
				{#if currentCurrency === 'BTC'}
					{$t('balance.sats')}
				{:else}
					{currentCurrency}
				{/if}
			</button>
		</div>
	</div>

	<!-- Transactions Section -->
	<div class="transactions-section">
		<Card variant="elevated" background="secondary" padding="none" className="transactions-card">
			<div class="transactions-list">
				{#if transactionsLoading}
					<div class="transaction-item">
						<div class="transaction-loading">
							{$t('transactions.loading_transactions')}
						</div>
					</div>
				{:else if transactionsError}
					<div class="transaction-item">
						<div class="transaction-error">
							{transactionsError}
						</div>
					</div>
				{:else if transactions.length === 0}
					<div class="transaction-item">
						<div class="transaction-empty">
							{$t('transactions.no_transactions')}
						</div>
					</div>
				{:else}
					{#each transactions as transaction (transaction.id)}
						<div class="transaction-item">
							<div class="transaction-icon {getTransactionIconColor(transaction)}">
								{getTransactionIcon(transaction)}
							</div>
							<div class="transaction-details">
								<div class="transaction-description">
									{transaction.description}
								</div>
								<div class="transaction-date">{transaction.date}</div>
							</div>
							<div
								class="transaction-amount {transaction.type === 'credit'
									? 'text-green-400'
									: 'text-red-500'}"
							>
								{#if currentCurrency === 'BTC'}
									{#if transaction.amount >= 0}+{:else}-{/if}{formatBalance(
										Math.abs(transaction.amount),
										'BTC'
									)}
								{:else if !btcPrice}
									N/A
								{:else}
									{@const fiatAmount =
										(Math.abs(transaction.amount) / 100_000_000) * btcPrice.usdPrice}
									{#if transaction.amount >= 0}+{:else}-{/if}{formatBalance(
										fiatAmount,
										currentCurrency
									)}
								{/if}
							</div>
						</div>
					{/each}
				{/if}
			</div>
		</Card>
	</div>

	<!-- Quick Actions -->
	<div class="quick-actions">
		<div class="action-buttons">
			<div class="action-item">
				<button type="button" class="custom-action-btn" on:click={handleReceive}>
					<img
						src="/receive-icon.png"
						alt={$t('actions.receive')}
						width="20"
						height="20"
						class="btn-icon"
					/>
					{$t('actions.receive')}
				</button>
			</div>
			<div class="custom-action-divider"></div>
			<div class="action-item">
				<button type="button" class="custom-action-btn" on:click={handlePay}>
					<img
						src="/send-icon.png"
						alt={$t('actions.send')}
						width="20"
						height="20"
						class="btn-icon"
					/>
					{$t('actions.pay')}
				</button>
			</div>
		</div>
	</div>
</main>

<style>
	.homebis-dashboard {
		min-height: 100vh;
		height: 100vh;
		background: var(--color-background, #121413);
		color: var(--color-text, #ffffff);
		padding: 0;
		margin: 0;
		max-width: 430px;
		margin: 0 auto;
		position: relative;
		border-radius: 10px;
		overflow: hidden;
		border: 8px solid #49454f;
		display: flex;
		flex-direction: column;
	}

	.loading-container {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100vh;
		width: 100%;
	}

	.loading-spinner {
		color: #f69413;
		font-size: 18px;
		font-weight: 500;
	}

	/* Remove focus outlines from all buttons */
	.homebis-dashboard button {
		outline: none !important;
	}
	.homebis-dashboard button:focus {
		outline: none !important;
		box-shadow: none !important;
	}

	.banner-notification {
		background: #ffffff;
		color: #000000;
		text-align: center;
		padding: 4px 12px;
		font-weight: 700;
		font-size: 12px;
		line-height: 10px;
		position: relative;
	}
	.close-banner {
		position: absolute;
		top: 4px;
		right: 8px;
		background: none;
		border: none;
		font-size: 16px;
		color: #000;
		cursor: pointer;
		padding: 0;
		line-height: 1;
	}

	.welcome-header {
		padding: 16px 24px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.welcome-content {
		display: flex;
		align-items: center;
		gap: 12px;
		flex: 1;
	}
	.header-actions {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.settings-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
	}
	.welcome-text {
		font-size: 16px;
		color: #cacaca;
		font-weight: 400;
	}

	.balance-section {
		padding: 24px;
	}
	.balance-card-wrapper {
		position: relative;
		padding: 2px;
		border-radius: 12px;
		background: linear-gradient(90deg, #824d07, #f69413);
	}

	.balance-display {
		text-align: center;
		position: relative;
	}
	.balance-amount {
		font-size: 57px;
		font-weight: 400;
		line-height: 64px;
		color: #ffffff;
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
		margin: 0;
		letter-spacing: -0.25px;
		transition: opacity 0.2s ease;
		outline: none !important;
	}
	.balance-amount:hover {
		opacity: 0.8;
	}
	.balance-amount:focus {
		outline: none !important;
		box-shadow: none !important;
	}
	.currency-button-container {
		display: flex;
		justify-content: center;
		margin-top: 16px;
	}
	.currency-button {
		font-family: 'Roboto', Arial, sans-serif;
		font-size: 36px;
		font-weight: 700;
		line-height: 44px;
		color: var(--color-primary, #f69413);
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
		transition: opacity 0.2s ease;
		position: relative;
		outline: none !important;
	}
	.currency-button:hover {
		opacity: 0.8;
	}
	.currency-button:focus {
		outline: none !important;
		box-shadow: none !important;
	}
	.currency-button::after {
		content: '';
		position: absolute;
		bottom: -4px;
		left: 50%;
		transform: translateX(-50%);
		width: 67px;
		height: 2px;
		background: var(--color-primary, #f69413);
	}

	.transactions-section {
		padding: 0 8px;
		flex: 1;
		min-height: 0;
		text-align: left;
		margin-bottom: 0;
		overflow-y: auto;
	}
	.transactions-list {
		height: 100%;
		overflow-y: auto;
		padding: 0 16px 0 16px;
	}
	.transaction-item {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 12px 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
	}
	.transaction-item:last-child {
		border-bottom: none;
	}
	.transaction-icon {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 10px;
		flex-shrink: 0;
	}
	.transaction-details {
		flex: 1;
		min-width: 0;
	}
	.transaction-description {
		font-size: 16px;
		font-weight: 400;
		color: #cacaca;
		line-height: 24px;
		margin-bottom: 2px;
	}
	.transaction-date {
		font-family: 'Montserrat', Arial, sans-serif;
		font-size: 12px;
		font-weight: 400;
		color: #cacaca;
		line-height: 16px;
		opacity: 0.7;
	}
	.transaction-amount {
		font-size: 16px;
		font-weight: 700;
		line-height: 24px;
		flex-shrink: 0;
		text-align: right;
		min-width: 80px;
	}
	.text-green-400 {
		color: #4ade80;
	}
	.text-green-500 {
		color: #22c55e;
	}
	.text-red-500 {
		color: #ef4444;
	}
	.text-white {
		color: #cacaca;
	}

	.transaction-loading,
	.transaction-error,
	.transaction-empty {
		text-align: center;
		padding: 20px;
		color: #cacaca;
		font-size: 14px;
		opacity: 0.8;
		width: 100%;
	}

	.transaction-error {
		color: #ef4444;
	}

	.transaction-loading {
		color: #f69413;
	}

	.quick-actions {
		padding: 0;
		background: var(--color-background, #121413);
		display: flex;
		justify-content: center;
		margin: 0;
		border-top: none;
		position: fixed;
		bottom: 20px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 100;
		width: 100%;
		max-width: 430px;
	}
	.action-buttons {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0;
		width: 100%;
		max-width: 300px;
	}
	.custom-action-divider {
		width: 1.5px;
		height: 36px;
		background: #fff;
		margin: 0 12px;
		border-radius: 1px;
		flex-shrink: 0;
		align-self: center;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.action-item {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: 1;
	}
	.action-icon {
		font-size: 24px;
		margin-bottom: 4px;
	}
	.action-divider {
		width: 1px;
		height: 40px;
		background: #fff;
		margin: 0 16px;
	}

	.custom-action-btn {
		background: var(--color-background, #121413);
		border: none;
		padding: 8px 32px;
		color: #fff;
		font-size: 26px;
		font-weight: 400;
		border-radius: 10px;
		transition:
			background 0.2s,
			color 0.2s;
		box-shadow: none;
		cursor: pointer;
		margin: 0;
		display: flex;
		align-items: center;
		gap: 8px;
		outline: none !important;
	}
	.custom-action-btn:focus {
		outline: none !important;
		box-shadow: none !important;
	}
	.btn-icon {
		flex-shrink: 0;
	}

	@media (max-width: 430px) {
		.homebis-dashboard {
			border-radius: 0;
			border: none;
			max-width: 100%;
		}
		.balance-amount {
			font-size: 48px;
			line-height: 56px;
		}
		.currency-button {
			font-size: 28px;
			line-height: 36px;
		}
		.transactions-section {
			padding: 0 4px;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.balance-amount,
		.currency-button {
			transition: none;
		}
	}

	@media (prefers-contrast: high) {
		.transaction-item {
			border-bottom: 2px solid rgba(255, 255, 255, 0.3);
		}
	}
</style>
