/**
 * @fileoverview Client-side Lightning Service Orchestrator
 *
 * This service orchestrates Lightning Network operations by delegating to
 * specialized services. It provides a unified interface while maintaining
 * single responsibility for each operation type.
 *
 * Key Features:
 * - Orchestrates specialized Lightning services
 * - Provides unified error handling and logging
 * - Maintains backward compatibility with existing API
 * - Delegates to focused, testable service modules
 *
 * @requires ./lightning - Specialized Lightning service modules
 * @requires $lib/utils/logger - Logging utilities
 * @requires $lib/utils/monitoring - Monitoring integration
 *
 * @author bim
 * @version 3.0.0
 */

import { logger } from '$lib/utils/logger';
import { monitoring } from '$lib/utils/monitoring';

// Import all specialized services and types
import {
	InvoiceService,
	LimitsService,
	QuoteService,
	StarknetToLightningService,
	SwapStatusService,
	type InvoiceCreationParams,
	type LightningInvoice,
	type LightningLimits,
	type LightningQuote,
	type QuoteParams,
	type StarknetToLightningParams,
	type StarknetToLightningSwap,
	type SwapStatus
} from './lightning';

// Re-export types from specialized services for backward compatibility
export type {
	InvoiceCreationParams,
	LightningInvoice,
	LightningLimits,
	LightningQuote,
	QuoteParams,
	StarknetToLightningParams,
	StarknetToLightningSwap,
	SwapStatus
} from './lightning';

/**
 * Lightning Service Orchestrator
 *
 * Orchestrates Lightning Network operations by delegating to specialized services.
 * Provides a unified interface while maintaining single responsibility.
 */
export class LightningService {
	private static instance: LightningService;

	// Specialized service instances
	private invoiceService: InvoiceService;
	private swapStatusService: SwapStatusService;
	private quoteService: QuoteService;
	private limitsService: LimitsService;

	private starknetToLightningService: StarknetToLightningService;

	private constructor() {
		// Initialize specialized services
		this.invoiceService = new InvoiceService();
		this.swapStatusService = new SwapStatusService();
		this.quoteService = new QuoteService();
		this.limitsService = new LimitsService();

		this.starknetToLightningService = new StarknetToLightningService();

		logger.info('Lightning Service Orchestrator initialized with specialized services');
	}

	/**
	 * Get singleton instance
	 */
	static getInstance(): LightningService {
		if (!LightningService.instance) {
			LightningService.instance = new LightningService();
		}
		return LightningService.instance;
	}

	/**
	 * Create a Lightning invoice for Bitcoin to Starknet swap
	 */
	async createInvoice(params: InvoiceCreationParams): Promise<LightningInvoice> {
		const startTime = Date.now();

		try {
			logger.info('Lightning Service Orchestrator: Delegating invoice creation', params);

			const result = await this.invoiceService.createInvoice(params);

			// Track success metrics
			monitoring.trackOperationTime('lightning_create_invoice', Date.now() - startTime);
			monitoring.incrementCounter('lightning_invoice_created');

			return result;
		} catch (error) {
			// Track error metrics
			monitoring.incrementCounter('lightning_invoice_creation_failed');
			logger.error(
				'Lightning Service Orchestrator: Invoice creation failed',
				error as Error,
				params
			);
			throw error;
		}
	}

	/**
	 * Get swap status for a Lightning swap
	 */
	async getSwapStatus(swapId: string): Promise<SwapStatus> {
		const startTime = Date.now();

		try {
			logger.info('Lightning Service Orchestrator: Delegating swap status retrieval', { swapId });

			const result = await this.swapStatusService.getSwapStatus(swapId);

			// Track success metrics
			monitoring.trackOperationTime('lightning_get_swap_status', Date.now() - startTime);

			return result;
		} catch (error) {
			monitoring.incrementCounter('lightning_swap_status_failed');
			logger.error('Lightning Service Orchestrator: Swap status retrieval failed', error as Error, {
				swapId
			});
			throw error;
		}
	}

	/**
	 * Update swap status (used by webhooks)
	 */
	async updateSwapStatus(swapId: string, update: Partial<SwapStatus>): Promise<void> {
		try {
			logger.info('Lightning Service Orchestrator: Delegating swap status update', {
				swapId,
				update
			});

			await this.swapStatusService.updateSwapStatus(swapId, update);
		} catch (error) {
			logger.error('Lightning Service Orchestrator: Swap status update failed', error as Error, {
				swapId,
				update
			});
			throw error;
		}
	}

	/**
	 * Get a quote for Lightning swap
	 */
	async getQuote(params: QuoteParams): Promise<LightningQuote> {
		const startTime = Date.now();

		try {
			logger.info('Lightning Service Orchestrator: Delegating quote request', params);

			const result = await this.quoteService.getQuote(params);

			// Track success metrics
			monitoring.trackOperationTime('lightning_get_quote', Date.now() - startTime);
			monitoring.incrementCounter('lightning_quote_requested');

			return result;
		} catch (error) {
			monitoring.incrementCounter('lightning_quote_failed');
			logger.error('Lightning Service Orchestrator: Quote request failed', error as Error, params);
			throw error;
		}
	}

	/**
	 * Get Lightning limits
	 */
	async getLimits(destinationAsset: string): Promise<LightningLimits> {
		const startTime = Date.now();

		try {
			logger.info('Lightning Service Orchestrator: Delegating limits retrieval', {
				destinationAsset
			});

			const result = await this.limitsService.getLimits(destinationAsset);

			// Track success metrics
			monitoring.trackOperationTime('lightning_get_limits', Date.now() - startTime);

			return result;
		} catch (error) {
			monitoring.incrementCounter('lightning_limits_failed');
			logger.error('Lightning Service Orchestrator: Limits retrieval failed', error as Error);
			throw error;
		}
	}

	/**
	 * Create Starknet to Lightning swap
	 */
	async createStarknetToLightningSwap(
		params: StarknetToLightningParams
	): Promise<StarknetToLightningSwap> {
		const startTime = Date.now();

		try {
			logger.info(
				'Lightning Service Orchestrator: Delegating Starknet to Lightning swap creation',
				params
			);

			const result = await this.starknetToLightningService.createStarknetToLightningSwap(params);

			// Track success metrics
			monitoring.trackOperationTime(
				'lightning_create_starknet_to_lightning',
				Date.now() - startTime
			);
			monitoring.incrementCounter('lightning_starknet_to_lightning_created');

			return result;
		} catch (error) {
			monitoring.incrementCounter('lightning_starknet_to_lightning_failed');
			logger.error(
				'Lightning Service Orchestrator: Starknet to Lightning swap creation failed',
				error as Error,
				params
			);
			throw error;
		}
	}
}

// Export factory function to prevent build-time initialization
export const getLightningService = (): LightningService => {
	return LightningService.getInstance();
};
