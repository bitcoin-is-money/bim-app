/**
 * @fileoverview Lightning Invoice Service
 *
 * Handles Lightning invoice creation and management operations.
 */

import { logger } from '$lib/utils/logger';
import { monitoring } from '$lib/utils/monitoring';
import type { LightningInvoice, InvoiceCreationParams } from './types';

/**
 * Service for Lightning invoice operations
 */
export class InvoiceService {
	private baseUrl: string;

	constructor(baseUrl: string = '/api/lightning') {
		this.baseUrl = baseUrl;
	}

	/**
	 * Create a Lightning invoice for Bitcoin to Starknet swap
	 */
	async createInvoice(params: InvoiceCreationParams): Promise<LightningInvoice> {
		const startTime = Date.now();

		try {
			logger.info('Invoice Service: Creating invoice', params);

			const response = await fetch(`${this.baseUrl}/create-invoice`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(params)
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${await response.text()}`);
			}

			const result = await response.json();

			// Track success metrics
			monitoring.trackOperationTime('lightning_create_invoice', Date.now() - startTime);
			monitoring.incrementCounter('lightning_invoice_created');

			// Extract the data from the API response wrapper
			return result.success ? result.data : result;
		} catch (error) {
			// Track error metrics
			monitoring.incrementCounter('lightning_invoice_creation_failed');
			logger.error('Invoice Service: Invoice creation failed', error as Error, params);
			throw error;
		}
	}
}

// Export singleton instance
export const invoiceService = new InvoiceService();
