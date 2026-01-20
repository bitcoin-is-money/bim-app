<!--
  @component
  Payment Monitor Component
  
  Self-contained component for monitoring Lightning and Bitcoin payment status
  with real-time updates and debugging capabilities. Extracts monitoring logic
  from payment generation components for better separation of concerns.
  
  Features:
  - Real-time payment status monitoring with polling
  - Visual status indicators and progress tracking
  - Debugging UI with pause/resume and manual poll
  - Polling metrics (attempts, errors, last poll time)
  - Auto-start monitoring or manual control
  
  @author bim
  @version 1.0.0
-->

<script lang="ts">
	import { usePaymentMonitorState } from '$lib/composables/usePaymentMonitorState';
	import type { SwapStatus } from '$lib/services/client/lightning.client.service';
	import { onDestroy, createEventDispatcher } from 'svelte';
	import DebugControls from './monitor-components/DebugControls.svelte';
	import ErrorDisplay from './monitor-components/ErrorDisplay.svelte';
	import { createPaymentMonitor } from './payment-monitor';

	// Event dispatcher
	const dispatch = createEventDispatcher();

	// Component props
	export let swapId: string;
	export let paymentMethod: 'lightning' | 'bitcoin';
	export let qrCodeReady: boolean = false;
	export let onStatusUpdate: (status: SwapStatus) => void = () => {};
	export let onComplete: (status: SwapStatus) => void = () => {};
	export let onError: (error: string) => void = () => {};
	export let onMonitoringChange: (monitoring: boolean) => void = () => {};
	export let showDebugUI: boolean = false;
	export let debugPolling: boolean = false;

	// Use the state management composable
	const monitor = usePaymentMonitorState();
	const { state, canStart, canStop, canPause, canResume } = monitor;

	// Local state for monitoring control
	let stopMonitoringFn: (() => void) | null = null;
	let countdownInterval: NodeJS.Timeout | null = null;
	let hasCompletedPayment = false; // Track if payment has completed to prevent restarts

	// Sync props with config store
	$: monitor.updateConfig({
		swapId,
		paymentMethod,
		qrCodeReady,
		debugPolling,
		showDebugUI
	});

	// Auto-start monitoring when QR code becomes ready (but not after completion)
	$: if (qrCodeReady && swapId && !$state.isMonitoring && !hasCompletedPayment) {
		console.log('PaymentMonitor: QR code is ready, auto-starting monitoring', {
			qrCodeReady,
			swapId,
			isMonitoring: $state.isMonitoring,
			hasCompletedPayment,
			timestamp: new Date().toISOString()
		});
		startMonitoring();
	}

	// Stop monitoring when QR code becomes not ready
	$: if (!qrCodeReady && $state.isMonitoring) {
		console.log('PaymentMonitor: QR code not ready, stopping monitoring', {
			qrCodeReady,
			isMonitoring: $state.isMonitoring,
			timestamp: new Date().toISOString()
		});
		stopMonitoringProcess();
	}

	onDestroy(() => {
		cleanup();
	});

	/**
	 * Start payment monitoring
	 */
	function startMonitoring() {
		if (!swapId) {
			console.error('PaymentMonitor: Cannot start monitoring - no swapId provided');
			monitor.handleError('No swap ID provided');
			return;
		}

		if ($state.isMonitoring) {
			console.log('PaymentMonitor: Already monitoring, skipping start');
			return;
		}

		if (hasCompletedPayment) {
			console.log('PaymentMonitor: Payment already completed, skipping start', {
				swapId,
				hasCompletedPayment,
				timestamp: new Date().toISOString()
			});
			return;
		}

		// Stop any existing monitoring to prevent duplicates
		if (stopMonitoringFn) {
			console.log('PaymentMonitor: Cleaning up existing monitor before starting new one');
			stopMonitoringFn();
			stopMonitoringFn = null;
		}

		console.log('PaymentMonitor: Starting monitoring', {
			swapId,
			paymentMethod,
			timestamp: new Date().toISOString()
		});

		// Reset state
		monitor.resetState();

		// Start the monitoring process
		stopMonitoringFn = createPaymentMonitor({
			swapId,
			paymentMethod,
			callbacks: {
				onStatusUpdate: handleStatusUpdate,
				onComplete: handleComplete,
				onError: handleError,
				onMonitoringChange: handleMonitoringChange
			},
			debugPolling
		});
	}

	/**
	 * Stop payment monitoring
	 */
	function stopMonitoringProcess() {
		console.log('PaymentMonitor: Stopping monitoring', {
			swapId,
			wasMonitoring: $state.isMonitoring,
			timestamp: new Date().toISOString()
		});

		if (stopMonitoringFn) {
			stopMonitoringFn();
			stopMonitoringFn = null;
		}

		monitor.handleMonitoringChange(false);
		clearCountdown();
	}

	/**
	 * Pause monitoring (for debugging)
	 */
	function pauseMonitoring() {
		if ($state.isMonitoring && !$state.isPaused) {
			console.log('PaymentMonitor: Pausing monitoring');
			monitor.setPaused(true);
		}
	}

	/**
	 * Resume monitoring (for debugging)
	 */
	function resumeMonitoring() {
		if ($state.isPaused) {
			console.log('PaymentMonitor: Resuming monitoring');
			monitor.setPaused(false);
		}
	}

	/**
	 * Manual poll for debugging
	 */
	async function manualPoll() {
		console.log('PaymentMonitor: Manual poll triggered');
		// This would require exposing a manual poll method from payment-monitor
		// For now, just log the action
	}

	/**
	 * Handle status updates from monitor
	 */
	function handleStatusUpdate(newStatus: SwapStatus) {
		if ($state.isPaused) {
			console.log('PaymentMonitor: Status update received but paused, ignoring');
			return;
		}

		monitor.handleStatusUpdate(newStatus);

		console.log('PaymentMonitor: Status updated', {
			status: newStatus.status,
			progress: newStatus.progress,
			pollingAttempts: $state.metrics.pollingAttempts,
			timestamp: new Date().toISOString()
		});

		// Dispatch Svelte event
		dispatch('statusUpdate', { status: newStatus });

		// Also call prop callback for backward compatibility
		onStatusUpdate(newStatus);
		startCountdown();
	}

	/**
	 * Handle monitoring completion
	 */
	function handleComplete(finalStatus: SwapStatus) {
		console.log('PaymentMonitor: Payment completed', {
			finalStatus: finalStatus.status,
			totalAttempts: $state.metrics.pollingAttempts,
			timestamp: new Date().toISOString()
		});

		// Mark payment as completed to prevent auto-restart
		hasCompletedPayment = true;

		monitor.handleMonitoringChange(false);
		clearCountdown();

		// Dispatch Svelte event
		dispatch('complete', { status: finalStatus });

		// Also call prop callback for backward compatibility
		onComplete(finalStatus);
	}

	/**
	 * Handle monitoring errors
	 */
	function handleError(errorMsg: string) {
		console.error('PaymentMonitor: Error occurred', {
			error: errorMsg,
			pollingAttempts: $state.metrics.pollingAttempts,
			timestamp: new Date().toISOString()
		});

		// Mark as completed if it's a terminal error (expired/failed)
		if (errorMsg.includes('expired') || errorMsg.includes('failed')) {
			hasCompletedPayment = true;
		}

		monitor.handleError(errorMsg);

		// Dispatch Svelte event
		dispatch('error', { error: errorMsg });

		// Also call prop callback for backward compatibility
		onError(errorMsg);
	}

	/**
	 * Handle monitoring state changes
	 */
	function handleMonitoringChange(monitoring: boolean) {
		console.log('PaymentMonitor: Monitoring state changed', {
			monitoring,
			previousState: $state.isMonitoring,
			timestamp: new Date().toISOString()
		});

		monitor.handleMonitoringChange(monitoring);

		// Dispatch Svelte event
		dispatch('monitoringChange', { monitoring });

		// Also call prop callback for backward compatibility
		onMonitoringChange(monitoring);

		if (!monitoring) {
			clearCountdown();
		}
	}

	/**
	 * Start countdown to next poll (for debugging)
	 */
	function startCountdown() {
		clearCountdown();

		// Update the state countdown
		monitor.updateMetrics({ nextPollCountdown: 2 });

		countdownInterval = setInterval(() => {
			const currentCountdown = $state.metrics.nextPollCountdown;
			if (currentCountdown > 0) {
				monitor.updateMetrics({ nextPollCountdown: currentCountdown - 1 });
			} else {
				clearCountdown();
			}
		}, 1000);
	}

	/**
	 * Clear countdown timer
	 */
	function clearCountdown() {
		if (countdownInterval) {
			clearInterval(countdownInterval);
			countdownInterval = null;
		}
		monitor.updateMetrics({ nextPollCountdown: 0 });
	}

	/**
	 * Cleanup on component destroy
	 */
	function cleanup() {
		stopMonitoringProcess();
		clearCountdown();
	}

	// Reset completion flag when swapId changes (new payment)
	$: if (swapId) {
		// Only reset if it's a different swap ID
		const currentSwapId = swapId;
		if (currentSwapId !== (window as any).__lastMonitoredSwapId) {
			console.log('PaymentMonitor: New swap detected, resetting completion flag', {
				previousSwapId: (window as any).__lastMonitoredSwapId,
				newSwapId: currentSwapId,
				timestamp: new Date().toISOString()
			});
			hasCompletedPayment = false;
			(window as any).__lastMonitoredSwapId = currentSwapId;
		}
	}

	// Export functions for parent component control
	export { startMonitoring, stopMonitoringProcess as stopMonitoring };
</script>

<div class="payment-monitor" class:debug-mode={showDebugUI}>
	{#if $state.isMonitoring}
		<div class="monitoring-indicator">
			<div class="spinner"></div>
			<span class="monitoring-text">Monitoring for incoming Lightning payment</span>
		</div>
	{/if}

	{#if showDebugUI}
		<DebugControls
			{startMonitoring}
			stopMonitoring={stopMonitoringProcess}
			{pauseMonitoring}
			{resumeMonitoring}
			{manualPoll}
			canStart={$canStart}
			canStop={$canStop}
			canPause={$canPause}
			canResume={$canResume}
			lastApiResponse={$state.metrics.lastApiResponse}
		/>
	{/if}

	{#if $state.monitoringError}
		<ErrorDisplay error={$state.monitoringError} />
	{/if}
</div>

<style>
	.payment-monitor {
		border: 1px solid #e2e8f0;
		border-radius: 8px;
		padding: 16px;
		background: #f8fafc;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
	}

	.debug-mode {
		border-color: #f59e0b;
		background: #fffbeb;
	}

	.monitoring-indicator {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
		margin: 16px 0;
		padding: 12px;
		background: #f1f5f9;
		border-radius: 6px;
		border: 1px solid #e2e8f0;
	}

	.spinner {
		width: 20px;
		height: 20px;
		border: 2px solid #e2e8f0;
		border-top: 2px solid #3b82f6;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	.monitoring-text {
		font-size: 14px;
		color: #64748b;
		font-weight: 500;
	}

	@keyframes spin {
		0% {
			transform: rotate(0deg);
		}
		100% {
			transform: rotate(360deg);
		}
	}
</style>
