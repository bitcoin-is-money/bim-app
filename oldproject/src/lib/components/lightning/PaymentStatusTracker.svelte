<!--
  @component
  Payment Status Tracker Component
  
  This component handles the display of payment status, progress tracking,
  and status updates for Lightning and Bitcoin payments.
  
  @prop swapStatus - Current swap status object
  @prop isMonitoring - Whether payment monitoring is active
  @prop loadingMessage - Current loading message to display
  @prop onStatusUpdate - Callback when status updates
  @prop onComplete - Callback when payment completes
  @prop onError - Callback when an error occurs
  
  @author bim
  @version 1.0.0
-->

<script lang="ts">
	import PaymentMonitor from './PaymentMonitor.svelte';
	import type { SwapStatus, LightningInvoice } from '$lib/services/client/lightning.client.service';
	import { t } from 'svelte-i18n';
	import { i18nReady as i18nReadyStore } from '$lib/stores/i18n';

	// Component props
	export let swapStatus: SwapStatus | null = null;
	export let isMonitoring = false;
	export let loadingMessage = '';
	export let lightningInvoice: LightningInvoice | null = null;
	export let bitcoinSwap: any | null = null;
	export let onStatusUpdate: (status: SwapStatus) => void = () => {};
	export let onComplete: (status: SwapStatus) => void = () => {};
	export let onError: (error: string) => void = () => {};
	export let onMonitoringChange: (monitoring: boolean) => void = () => {};

	// PaymentMonitor component reference
	let paymentMonitor: PaymentMonitor;

	/**
	 * Get status badge class based on status
	 */
	function getStatusBadgeClass(status: string): string {
		switch (status) {
			case 'pending':
				return 'status-pending';
			case 'paid':
				return 'status-paid';
			case 'confirming':
				return 'status-confirming';
			case 'completed':
				return 'status-completed';
			case 'failed':
				return 'status-failed';
			case 'expired':
				return 'status-expired';
			default:
				return 'status-pending';
		}
	}

	/**
	 * Get status display text
	 */
	function getStatusText(status: string): string {
		if (!$i18nReadyStore) {
			switch (status) {
				case 'pending':
					return 'Waiting for payment...';
				case 'paid':
					return 'Payment received!';
				case 'confirming':
					return 'Confirming payment...';
				case 'completed':
					return 'Swap completed successfully!';
				case 'failed':
					return 'Payment failed';
				case 'expired':
					return 'Payment expired';
				default:
					return 'Unknown status';
			}
		}

		switch (status) {
			case 'pending':
				return $t('lightning.waitingForPayment');
			case 'paid':
				return $t('lightning.paymentReceivedStatus');
			case 'confirming':
				return $t('lightning.confirmingPayment');
			case 'completed':
				return $t('lightning.swapCompletedSuccessfully');
			case 'failed':
				return $t('lightning.paymentFailed');
			case 'expired':
				return $t('lightning.paymentExpired');
			default:
				return $t('lightning.unknownStatus');
		}
	}

	/**
	 * Get progress percentage based on status
	 */
	function getProgressPercentage(status: string): number {
		switch (status) {
			case 'pending':
				return 20;
			case 'paid':
				return 60;
			case 'confirming':
				return 80;
			case 'completed':
				return 100;
			case 'failed':
				return 0;
			case 'expired':
				return 0;
			default:
				return 0;
		}
	}

	/**
	 * Format timestamp for display
	 */
	function formatTimestamp(timestamp: string): string {
		return new Date(timestamp).toLocaleString();
	}

	/**
	 * Handle status updates from PaymentMonitor
	 */
	function handleStatusUpdate(newStatus: SwapStatus) {
		swapStatus = newStatus;
		onStatusUpdate(newStatus);
	}

	/**
	 * Handle payment completion from PaymentMonitor
	 */
	function handleComplete(finalStatus: SwapStatus) {
		onComplete(finalStatus);
	}

	/**
	 * Handle errors from PaymentMonitor
	 */
	function handleError(errorMsg: string) {
		onError(errorMsg);
	}

	/**
	 * Handle monitoring state changes from PaymentMonitor
	 */
	function handleMonitoringChange(monitoring: boolean) {
		isMonitoring = monitoring;
		onMonitoringChange(monitoring);
	}

	/**
	 * Stop monitoring when component is destroyed
	 */
	// Commented out as this is only used in onDestroy cleanup
	// function stopMonitoring() {
	// 	if (paymentMonitor) {
	// 		paymentMonitor.stopMonitoring();
	// 	}
	// }

	// Determine what payment data to show to PaymentMonitor
	$: paymentData = lightningInvoice || bitcoinSwap;
	$: paymentType = lightningInvoice ? 'lightning' : 'bitcoin';

	// Show status tracker when we have payment data or status
	$: showStatusTracker = swapStatus || isMonitoring || loadingMessage;
</script>

{#if showStatusTracker}
	<div class="status-tracker">
		{#if loadingMessage}
			<div class="loading-section">
				<div class="loading-spinner"></div>
				<p class="loading-text">{loadingMessage}</p>
			</div>
		{/if}

		{#if swapStatus}
			<div class="status-section">
				<h5>Payment Status</h5>

				<div class="status-badge {getStatusBadgeClass(swapStatus.status)}">
					{getStatusText(swapStatus.status)}
				</div>

				<div class="progress-bar">
					<div
						class="progress-fill"
						style="width: {getProgressPercentage(swapStatus.status)}%"
					></div>
				</div>

				<p class="progress-text">
					{getStatusText(swapStatus.status)}
				</p>

				{#if swapStatus.lastUpdated}
					<p class="timestamp">
						Last updated: {formatTimestamp(swapStatus.lastUpdated)}
					</p>
				{/if}

				{#if swapStatus.amount}
					<div class="amount-info">
						<p>
							<strong>Amount:</strong>
							{swapStatus.amount.toLocaleString()} sats
						</p>
						{#if swapStatus.destinationAsset}
							<p>
								<strong>Asset:</strong>
								{swapStatus.destinationAsset}
							</p>
						{/if}
					</div>
				{/if}

				{#if swapStatus.txHash}
					<div class="transaction-info">
						<p><strong>Transaction:</strong></p>
						<code class="tx-hash">{swapStatus.txHash}</code>
					</div>
				{/if}
			</div>
		{/if}

		{#if isMonitoring}
			<div class="monitoring-indicator">
				<div class="monitoring-pulse"></div>
				<span>Monitoring payment status...</span>
			</div>
		{/if}
	</div>
{/if}

<!-- Payment Monitor Component -->
{#if paymentData}
	<PaymentMonitor
		bind:this={paymentMonitor}
		invoice={lightningInvoice}
		{bitcoinSwap}
		{paymentType}
		on:statusUpdate={(e) => handleStatusUpdate(e.detail)}
		on:complete={(e) => handleComplete(e.detail)}
		on:error={(e) => handleError(e.detail)}
		on:monitoringChange={(e) => handleMonitoringChange(e.detail)}
	/>
{/if}

<style>
	.status-tracker {
		margin: 1rem 0;
		padding: 1rem;
		background: #1a1a1a;
		border-radius: 12px;
		color: white;
	}

	.loading-section {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.loading-spinner {
		width: 20px;
		height: 20px;
		border: 2px solid #333;
		border-top: 2px solid #4caf50;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		0% {
			transform: rotate(0deg);
		}
		100% {
			transform: rotate(360deg);
		}
	}

	.loading-text {
		margin: 0;
		font-size: 0.875rem;
		color: #b0b0b0;
	}

	.status-section {
		text-align: left;
	}

	.status-section h5 {
		margin: 0 0 0.75rem 0;
		color: #fff;
		font-size: 1rem;
		font-weight: 600;
	}

	.status-badge {
		display: inline-block;
		padding: 0.375rem 0.75rem;
		border-radius: 6px;
		font-size: 0.75rem;
		font-weight: 600;
		margin-bottom: 0.75rem;
		text-transform: uppercase;
	}

	.status-pending {
		background: #ffa500;
		color: #000;
	}

	.status-paid {
		background: #4caf50;
		color: #fff;
	}

	.status-confirming {
		background: #2196f3;
		color: #fff;
	}

	.status-completed {
		background: #4caf50;
		color: #fff;
	}

	.status-failed {
		background: #f44336;
		color: #fff;
	}

	.status-expired {
		background: #757575;
		color: #fff;
	}

	.progress-bar {
		width: 100%;
		height: 8px;
		background: #333;
		border-radius: 4px;
		overflow: hidden;
		margin-bottom: 0.5rem;
	}

	.progress-fill {
		height: 100%;
		background: linear-gradient(90deg, #4caf50, #81c784);
		transition: width 0.3s ease;
		border-radius: 4px;
	}

	.progress-text {
		color: #b0b0b0;
		font-size: 0.75rem;
		margin: 0 0 0.5rem 0;
	}

	.timestamp {
		color: #888;
		font-size: 0.7rem;
		margin: 0.5rem 0;
		font-style: italic;
	}

	.amount-info {
		margin: 0.75rem 0;
		padding: 0.5rem;
		background: #2a2a2a;
		border-radius: 6px;
	}

	.amount-info p {
		margin: 0.25rem 0;
		font-size: 0.875rem;
	}

	.transaction-info {
		margin: 0.75rem 0;
	}

	.transaction-info p {
		margin: 0 0 0.25rem 0;
		font-size: 0.875rem;
	}

	.tx-hash {
		display: block;
		padding: 0.5rem;
		background: #2a2a2a;
		border-radius: 4px;
		font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
		font-size: 0.7rem;
		word-break: break-all;
		color: #4caf50;
	}

	.monitoring-indicator {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 1rem;
		padding: 0.5rem;
		background: #2a2a2a;
		border-radius: 6px;
		font-size: 0.75rem;
		color: #b0b0b0;
	}

	.monitoring-pulse {
		width: 8px;
		height: 8px;
		background: #4caf50;
		border-radius: 50%;
		animation: pulse 2s infinite;
	}

	@keyframes pulse {
		0% {
			opacity: 1;
			transform: scale(1);
		}
		50% {
			opacity: 0.5;
			transform: scale(1.2);
		}
		100% {
			opacity: 1;
			transform: scale(1);
		}
	}

	@media (max-width: 640px) {
		.status-tracker {
			padding: 0.75rem;
		}

		.amount-info {
			padding: 0.375rem;
		}

		.tx-hash {
			font-size: 0.65rem;
			padding: 0.375rem;
		}
	}
</style>
