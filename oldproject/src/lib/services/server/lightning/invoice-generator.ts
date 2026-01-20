/**
 * @fileoverview Lightning Invoice Generator
 *
 * Handles Lightning invoice generation and payment creation.
 * Extracted from LightningService for Single Responsibility Principle.
 */

import { ErrorHandlers, LightningError, LightningErrors } from '$lib/errors/lightning';
import type { CreateLightningPaymentOptions, LightningInvoice } from '$lib/types/lightning';
import { logger } from '$lib/utils/logger';
import { monitoring } from '$lib/utils/monitoring';
import { CircuitBreakerUtils } from '$lib/utils/network/circuit-breaker/utils';
import { retryLightningOperation } from '$lib/utils/network/retry';
import { getAtomiqService } from '../atomiq';
import { getSupportedAssets } from '../atomiq-assets';
import type { SupportedAsset } from '../atomiq/types';
import { lightningLimits } from '../lightning-limits.service';

export class LightningInvoiceGenerator {
	private qrCodeGenerator: ((hyperlink: string) => Promise<string>) | undefined;

	constructor(qrCodeGenerator?: (hyperlink: string) => Promise<string>) {
		this.qrCodeGenerator = qrCodeGenerator;
	}

	/**
	 * Initialize the service
	 */
	async initialize(): Promise<void> {
		logger.info('Lightning Invoice Generator initialized');
	}

	/**
	 * Health check
	 */
	async healthCheck(): Promise<boolean> {
		return true;
	}

	/**
	 * Create a Lightning invoice for Bitcoin to Starknet swap
	 *
	 * Generates a Lightning Network invoice that when paid will
	 * automatically swap the Bitcoin to the specified Starknet asset.
	 *
	 * @param options - Payment creation options
	 * @returns Promise resolving to Lightning invoice data
	 *
	 * @example
	 * ```typescript
	 * const invoice = await invoiceGenerator.createLightningPayment({
	 *   amount: 100000, // 100,000 sats
	 *   starknetAddress: '0x123...',
	 *   destinationAsset: 'WBTC'
	 * });
	 * ```
	 */
	async createLightningPayment(options: CreateLightningPaymentOptions): Promise<LightningInvoice> {
		// Validate inputs with dynamic limits
		await this.validatePaymentOptions(options);

		try {
			logger.info('Creating Lightning payment', {
				amount: options.amount,
				destinationAsset: options.destinationAsset || 'WBTC',
				starknetAddress: options.starknetAddress?.substring(0, 10) + '...'
			});

			// Create Lightning swap with Atomiq SDK
			const swapResponse = await CircuitBreakerUtils.executeLightningOperation(async () => {
				return await getAtomiqService().createLightningToStarknetSwap({
					amountSats: options.amount,
					destinationAsset: (options.destinationAsset || 'WBTC') as SupportedAsset,
					starknetAddress: options.starknetAddress,
					expirationMinutes: options.expirationMinutes || 15
				});
			}, 'create-lightning-swap');

			// Generate QR code from SDK hyperlink data with retry logic (if generator available)
			const qrCode = this.qrCodeGenerator
				? await retryLightningOperation(
						() => this.qrCodeGenerator!(swapResponse.hyperlink),
						'qr-code-generation'
					)
				: undefined;

			const lightningInvoice: LightningInvoice = {
				swapId: swapResponse.swapId,
				invoice: swapResponse.invoice,
				hyperlink: swapResponse.hyperlink, // Store SDK hyperlink data
				expiresAt: swapResponse.expiresAt,
				amount: options.amount,
				starknetAddress: options.starknetAddress,
				destinationAsset: (options.destinationAsset || 'WBTC') as SupportedAsset,
				estimatedOutput: swapResponse.estimatedOutput,
				...(qrCode && { qrCode })
			};

			logger.info('Lightning payment created successfully', {
				swapId: swapResponse.swapId,
				amount: options.amount,
				destinationAsset: (options.destinationAsset || 'WBTC') as SupportedAsset,
				estimatedOutput: swapResponse.estimatedOutput
			});

			monitoring.addBreadcrumb('Lightning invoice created', 'lightning', {
				swapId: swapResponse.swapId,
				amount: options.amount,
				destinationAsset: (options.destinationAsset || 'WBTC') as SupportedAsset,
				estimatedOutput: swapResponse.estimatedOutput
			});

			return lightningInvoice;
		} catch (error) {
			const lightningError =
				error instanceof LightningError
					? error
					: ErrorHandlers.fromUnknownError(error, {
							operation: 'createLightningPayment',
							amount: options.amount,
							destinationAsset: options.destinationAsset,
							starknetAddress: options.starknetAddress
						});

			logger.error('Lightning payment creation failed', lightningError);
			throw lightningError;
		}
	}

	/**
	 * Validate payment options with dynamic limits
	 */
	private async validatePaymentOptions(options: CreateLightningPaymentOptions): Promise<void> {
		// Validate amount is present and positive
		if (!options.amount || options.amount <= 0) {
			throw LightningErrors.invalidAmount(
				options.amount,
				{ min: 1, max: 1000000000 } // 10 BTC max
			);
		}

		// Validate amount against dynamic limits
		const asset = options.destinationAsset || 'WBTC';
		await lightningLimits.validateAmount(options.amount, asset);

		// Validate Starknet address
		if (!options.starknetAddress) {
			throw LightningErrors.invalidAddress(options.starknetAddress);
		}

		if (!options.starknetAddress.startsWith('0x') || options.starknetAddress.length !== 66) {
			throw LightningErrors.invalidAddress(options.starknetAddress);
		}

		// Validate destination asset
		const supportedAssets = await getSupportedAssets();
		if (!supportedAssets.includes(asset)) {
			throw LightningErrors.unsupportedAsset(asset, { supportedAssets });
		}
	}
}
