import { PaymentMonitorService } from '$lib/services/client/payment-monitor.service';
import type {
	PaymentMonitorCallbacks,
	PaymentMonitorConfig
} from '$lib/types/payment-monitor.types';

// Re-export types for backward compatibility
export type { PaymentMonitorCallbacks, PaymentMonitorConfig };

/**
 * Create a payment monitor for a given swap
 * Returns a cleanup function that can be called to stop monitoring
 */
export function createPaymentMonitor(config: PaymentMonitorConfig): () => void {
	const service = new PaymentMonitorService(config);

	// Start monitoring immediately
	service.startMonitoring().catch((error) => {
		console.error('Failed to start payment monitoring:', error);
		config.callbacks.onError(`Failed to start monitoring: ${error.message}`);
	});

	// Return cleanup function that maintains original API
	return () => service.destroy();
}
