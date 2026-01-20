import type { SwapStatus } from '$lib/services/client/lightning.client.service';

export interface PaymentMonitorCallbacks {
	onStatusUpdate: (status: SwapStatus) => void;
	onComplete: (status: SwapStatus) => void;
	onError: (error: string) => void;
	onMonitoringChange: (monitoring: boolean) => void;
}

export interface PaymentMonitorConfig {
	swapId: string;
	paymentMethod: 'lightning' | 'bitcoin';
	callbacks: PaymentMonitorCallbacks;
	debugPolling?: boolean;
}

export interface MonitoringState {
	pollInterval: NodeJS.Timeout | null;
	lastStatus: SwapStatus | null;
	isMonitoring: boolean;
}

export type PaymentStatus =
	| 'pending'
	| 'waiting_payment'
	| 'paid'
	| 'confirming'
	| 'completed'
	| 'failed'
	| 'expired';

export interface StatusChangeEvent {
	swapId: string;
	previousStatus: string;
	newStatus: string;
	progress?: number;
	attempt: number;
	timestamp: string;
}
