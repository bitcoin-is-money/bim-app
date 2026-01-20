import type { SwapStatus } from '$lib/services/client/lightning.client.service';
import { derived, get, writable } from 'svelte/store';

export interface MonitoringMetrics {
	pollingAttempts: number;
	pollingErrors: number;
	lastPollTime: Date | null;
	nextPollCountdown: number;
	lastApiResponse: any;
}

export interface MonitoringState {
	isMonitoring: boolean;
	isPaused: boolean;
	swapStatus: SwapStatus | null;
	monitoringError: string;
	metrics: MonitoringMetrics;
}

export interface MonitoringConfig {
	swapId: string;
	paymentMethod: 'lightning' | 'bitcoin';
	qrCodeReady: boolean;
	debugPolling: boolean;
	showDebugUI: boolean;
}

export function usePaymentMonitorState() {
	const state = writable<MonitoringState>({
		isMonitoring: false,
		isPaused: false,
		swapStatus: null,
		monitoringError: '',
		metrics: {
			pollingAttempts: 0,
			pollingErrors: 0,
			lastPollTime: null,
			nextPollCountdown: 0,
			lastApiResponse: null
		}
	});

	const config = writable<MonitoringConfig>({
		swapId: '',
		paymentMethod: 'lightning',
		qrCodeReady: false,
		debugPolling: false,
		showDebugUI: false
	});

	// Derived status information
	const statusText = derived([state, config], ([s, c]) => {
		if (!c.swapId) return 'No swap ID';
		if (!c.qrCodeReady) return 'Waiting for QR code';
		if (s.isPaused) return 'Paused';
		if (s.isMonitoring) return 'Monitoring...';
		if (s.monitoringError) return `Error: ${s.monitoringError}`;
		if (s.swapStatus?.status === 'completed') return 'Completed';
		if (s.swapStatus?.status === 'failed') return 'Failed';
		return 'Stopped';
	});

	const statusClass = derived([state, config], ([s, c]) => {
		if (!c.qrCodeReady) return 'status-waiting';
		if (s.isPaused) return 'status-paused';
		if (s.isMonitoring) return 'status-monitoring';
		if (s.monitoringError) return 'status-error';
		if (s.swapStatus?.status === 'completed') return 'status-completed';
		if (s.swapStatus?.status === 'failed') return 'status-failed';
		return 'status-stopped';
	});

	const canStart = derived(
		[state, config],
		([s, c]) => c.swapId && (!s.isMonitoring || s.isPaused)
	);

	const canStop = derived([state], ([s]) => s.isMonitoring);

	const canPause = derived([state], ([s]) => s.isMonitoring && !s.isPaused);

	const canResume = derived([state], ([s]) => s.isPaused);

	// Actions
	function updateState(updates: Partial<MonitoringState>) {
		state.update((current) => ({ ...current, ...updates }));
	}

	function updateConfig(updates: Partial<MonitoringConfig>) {
		config.update((current) => ({ ...current, ...updates }));
	}

	function updateMetrics(updates: Partial<MonitoringMetrics>) {
		state.update((current) => ({
			...current,
			metrics: { ...current.metrics, ...updates }
		}));
	}

	function resetState() {
		state.update((current) => ({
			...current,
			isMonitoring: false,
			isPaused: false,
			swapStatus: null,
			monitoringError: '',
			metrics: {
				pollingAttempts: 0,
				pollingErrors: 0,
				lastPollTime: null,
				nextPollCountdown: 0,
				lastApiResponse: null
			}
		}));
	}

	function handleStatusUpdate(newStatus: SwapStatus) {
		updateState({ swapStatus: newStatus });
		updateMetrics({
			pollingAttempts: get(state).metrics.pollingAttempts + 1,
			pollingErrors: 0, // Reset error count on successful update
			lastPollTime: new Date(),
			lastApiResponse: newStatus
		});
	}

	function handleError(errorMsg: string) {
		updateState({ monitoringError: errorMsg });
		updateMetrics({
			pollingErrors: get(state).metrics.pollingErrors + 1
		});
	}

	function handleMonitoringChange(monitoring: boolean) {
		updateState({ isMonitoring: monitoring });
		if (!monitoring) {
			updateMetrics({ nextPollCountdown: 0 });
		}
	}

	function setPaused(paused: boolean) {
		updateState({ isPaused: paused });
	}

	function formatTime(date: Date | null): string {
		if (!date) return 'Never';
		return date.toLocaleTimeString();
	}

	return {
		// Stores
		state,
		config,
		statusText,
		statusClass,
		canStart,
		canStop,
		canPause,
		canResume,

		// Actions
		updateState,
		updateConfig,
		updateMetrics,
		resetState,
		handleStatusUpdate,
		handleError,
		handleMonitoringChange,
		setPaused,

		// Utilities
		formatTime
	};
}
