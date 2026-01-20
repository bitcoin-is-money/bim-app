<!--
  @component
  Lightning Network Limits Display Component
  
  This component displays the current Lightning Network transaction limits
  for different assets. It demonstrates the dynamic limits system in action.
  
  Key Features:
  - Fetches real-time limits from the API
  - Shows min/max amounts for each asset
  - Displays fee information
  - Auto-refreshes limits periodically
  - Error handling for API failures
  
  @author bim
  @version 1.0.0
-->

<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import { onDestroy, onMount } from 'svelte';

	interface LightningLimits {
		asset: string;
		min: number;
		max: number;
		maxDailyVolume?: number;
		fees?: {
			fixed: number;
			percentage: number;
		};
		updatedAt: string;
	}

	// Component state
	let limits: Record<string, LightningLimits> = {};
	let isLoading = false;
	let error: string | null = null;
	let lastUpdated: Date | null = null;
	let refreshInterval: NodeJS.Timeout | null = null;

	// Auto-refresh every 5 minutes
	const REFRESH_INTERVAL = 300000;

	/**
	 * Fetch limits from the API
	 */
	async function fetchLimits(): Promise<void> {
		try {
			isLoading = true;
			error = null;

			console.log('Fetching Lightning Network limits');

			// Use the service layer instead of direct fetch
			// For now, we'll use a default asset like 'WBTC' or get all assets
			const response = await fetch('/api/lightning/limits');

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const data = await response.json();

			if (data.error) {
				throw new Error(data.message || 'Failed to fetch limits');
			}

			// Transform the response to match our interface
			if (data.assets) {
				limits = {};
				for (const [asset, assetLimits] of Object.entries(data.assets)) {
					limits[asset] = {
						asset,
						...(assetLimits as any)
					};
				}
				lastUpdated = new Date(data.updatedAt);
			}

			console.log('Lightning limits fetched successfully', {
				assets: Object.keys(limits),
				updatedAt: lastUpdated
			});
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : 'Unknown error';
			error = `Failed to fetch limits: ${errorMessage}`;
			console.error('Failed to fetch Lightning limits', err);
		} finally {
			isLoading = false;
		}
	}

	/**
	 * Format satoshi amount for display
	 */
	function formatSatoshis(sats: number): string {
		if (sats >= 100000000) {
			return `${(sats / 100000000).toFixed(8)} BTC`;
		} else if (sats >= 1000) {
			return `${(sats / 1000).toFixed(0)}k sats`;
		} else {
			return `${sats} sats`;
		}
	}

	/**
	 * Format percentage for display
	 */
	function formatPercentage(percent: number): string {
		return `${percent.toFixed(2)}%`;
	}

	/**
	 * Get asset color for display
	 */
	function getAssetColor(asset: string): string {
		const colors: Record<string, string> = {
			WBTC: 'text-orange-600'
		};
		return colors[asset] || 'text-gray-600';
	}

	/**
	 * Start auto-refresh
	 */
	function startAutoRefresh(): void {
		if (refreshInterval) {
			clearInterval(refreshInterval);
		}

		refreshInterval = setInterval(fetchLimits, REFRESH_INTERVAL);
	}

	/**
	 * Stop auto-refresh
	 */
	function stopAutoRefresh(): void {
		if (refreshInterval) {
			clearInterval(refreshInterval);
			refreshInterval = null;
		}
	}

	// Lifecycle
	onMount(() => {
		fetchLimits();
		startAutoRefresh();
	});

	onDestroy(() => {
		stopAutoRefresh();
	});
</script>

<Card class="w-full max-w-4xl mx-auto">
	<div class="flex items-center justify-between mb-6">
		<h2 class="text-2xl font-bold text-gray-900">Lightning Network Limits</h2>
		<div class="flex items-center space-x-4">
			{#if lastUpdated}
				<span class="text-sm text-gray-500">
					Updated: {lastUpdated.toLocaleTimeString()}
				</span>
			{/if}
			<Button on:click={fetchLimits} disabled={isLoading} size="sm" variant="secondary">
				{isLoading ? 'Refreshing...' : 'Refresh'}
			</Button>
		</div>
	</div>

	{#if error}
		<div class="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
			<div class="flex">
				<div class="flex-shrink-0">
					<svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
						<path
							fill-rule="evenodd"
							d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
							clip-rule="evenodd"
						/>
					</svg>
				</div>
				<div class="ml-3">
					<p class="text-sm text-red-800">{error}</p>
				</div>
			</div>
		</div>
	{/if}

	{#if isLoading && Object.keys(limits).length === 0}
		<div class="flex items-center justify-center py-12">
			<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
			<span class="ml-3 text-gray-600">Loading limits...</span>
		</div>
	{:else if Object.keys(limits).length === 0}
		<div class="text-center py-12 text-gray-500">
			<p>No limits available</p>
			<Button on:click={fetchLimits} class="mt-4">Try Again</Button>
		</div>
	{:else}
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
			{#each Object.entries(limits) as [asset, assetLimits]}
				<div
					class="bg-white border border-gray-200 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow"
				>
					<div class="flex items-center justify-between mb-4">
						<h3 class="text-lg font-semibold {getAssetColor(asset)}">
							{asset}
						</h3>
						<span class="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
							{assetLimits.asset}
						</span>
					</div>

					<div class="space-y-3">
						<!-- Min Amount -->
						<div>
							<label class="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
								Minimum Amount
							</label>
							<p class="text-sm font-mono text-gray-900">
								{formatSatoshis(assetLimits.min)}
							</p>
						</div>

						<!-- Max Amount -->
						<div>
							<label class="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
								Maximum Amount
							</label>
							<p class="text-sm font-mono text-gray-900">
								{formatSatoshis(assetLimits.max)}
							</p>
						</div>

						<!-- Daily Volume -->
						{#if assetLimits.maxDailyVolume}
							<div>
								<label class="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
									Daily Volume Limit
								</label>
								<p class="text-sm font-mono text-gray-900">
									{formatSatoshis(assetLimits.maxDailyVolume)}
								</p>
							</div>
						{/if}

						<!-- Fees -->
						{#if assetLimits.fees}
							<div class="pt-2 border-t border-gray-100">
								<label class="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
									Fees
								</label>
								<div class="space-y-1">
									<div class="flex justify-between text-sm">
										<span class="text-gray-600">Fixed:</span>
										<span class="font-mono text-gray-900">
											{formatSatoshis(assetLimits.fees.fixed)}
										</span>
									</div>
									<div class="flex justify-between text-sm">
										<span class="text-gray-600">Percentage:</span>
										<span class="font-mono text-gray-900">
											{formatPercentage(assetLimits.fees.percentage)}
										</span>
									</div>
								</div>
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<div class="mt-6 text-xs text-gray-500 text-center">
		<p>
			Limits are fetched dynamically from the Atomiq SDK and updated every 5 minutes.
			{#if lastUpdated}
				Last updated: {lastUpdated.toLocaleString()}
			{/if}
		</p>
	</div>
</Card>

<style>
	.animate-spin {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}
</style>
