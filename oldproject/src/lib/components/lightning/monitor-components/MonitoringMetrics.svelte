<script lang="ts">
	import type { MonitoringMetrics } from '$lib/composables/usePaymentMonitorState';

	export let metrics: MonitoringMetrics;
	export let qrCodeReady: boolean;
	export let formatTime: (date: Date | null) => string;
</script>

<div class="monitoring-metrics">
	<div class="metric">
		<span class="metric-label">Attempts:</span>
		<span class="metric-value">{metrics.pollingAttempts}</span>
	</div>
	<div class="metric">
		<span class="metric-label">Errors:</span>
		<span class="metric-value" class:error={metrics.pollingErrors > 0}>
			{metrics.pollingErrors}
		</span>
	</div>
	<div class="metric">
		<span class="metric-label">Last Poll:</span>
		<span class="metric-value">{formatTime(metrics.lastPollTime)}</span>
	</div>
	<div class="metric">
		<span class="metric-label">QR Ready:</span>
		<span class="metric-value" class:success={qrCodeReady} class:error={!qrCodeReady}>
			{qrCodeReady ? 'Yes' : 'No'}
		</span>
	</div>
	{#if metrics.nextPollCountdown > 0}
		<div class="metric">
			<span class="metric-label">Next Poll:</span>
			<span class="metric-value">{metrics.nextPollCountdown}s</span>
		</div>
	{/if}
</div>

<style>
	.monitoring-metrics {
		display: flex;
		gap: 12px;
		flex-wrap: wrap;
		margin-bottom: 12px;
		padding: 8px;
		background: white;
		border-radius: 4px;
		font-size: 14px;
	}

	.metric {
		display: flex;
		gap: 4px;
	}

	.metric-label {
		color: #6b7280;
		font-weight: 500;
	}

	.metric-value {
		color: #374151;
		font-weight: 600;
	}

	.metric-value.error {
		color: #dc2626;
	}

	.metric-value.success {
		color: #059669;
	}
</style>
