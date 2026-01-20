/**
 * @fileoverview QR Code Generator
 *
 * Handles QR code generation for Lightning payments.
 * Extracted from LightningService for Single Responsibility Principle.
 */

import { LightningError, LightningErrors } from '$lib/errors/lightning';
import { logger } from '$lib/utils/logger';
import QRCode from 'qrcode';

export class QRCodeGenerator {
	/**
	 * Generate QR code for Lightning payment
	 *
	 * Converts hyperlink data from the Atomiq SDK into a QR code
	 * that can be scanned by Lightning wallets. The hyperlink contains
	 * the appropriate payment data for the Lightning Network.
	 *
	 * @param hyperlink - Hyperlink data from SDK getHyperlink() method
	 * @returns Promise resolving to QR code data URL
	 */
	async generateQRCode(hyperlink: string): Promise<string> {
		try {
			if (!hyperlink) {
				throw LightningErrors.validationError(
					'Hyperlink is required for QR code generation',
					'Invalid hyperlink data from SDK',
					{ hyperlink }
				);
			}

			// Validate hyperlink format - should be a Lightning invoice or bitcoin URI
			if (
				!hyperlink.startsWith('lnbc') &&
				!hyperlink.startsWith('lntb') &&
				!hyperlink.startsWith('bitcoin:')
			) {
				logger.warn('Hyperlink does not appear to be a valid Lightning invoice or bitcoin URI', {
					hyperlink: hyperlink.substring(0, 50) + '...',
					startsWithLnbc: hyperlink.startsWith('lnbc'),
					startsWithLntb: hyperlink.startsWith('lntb'),
					startsWithBitcoin: hyperlink.startsWith('bitcoin:')
				});

				// Still proceed with QR generation as the SDK knows best
			}

			return await QRCode.toDataURL(hyperlink, {
				width: 400, // Increased from 300 to 400 for better readability
				margin: 4, // Increased from 2 to 4 for better quiet zone
				color: {
					dark: '#000000',
					light: '#FFFFFF'
				},
				errorCorrectionLevel: 'H', // High error correction for better damage tolerance
				// Enhanced rendering options
				rendererOpts: {
					quality: 1.0
				}
			});
		} catch (error) {
			if (error instanceof LightningError) {
				throw error;
			}

			const lightningError = LightningErrors.internalError(
				'Failed to generate QR code',
				'Unable to generate QR code for Lightning payment',
				{ hyperlink: hyperlink?.substring(0, 20) + '...', originalError: error }
			);

			throw lightningError;
		}
	}
}
