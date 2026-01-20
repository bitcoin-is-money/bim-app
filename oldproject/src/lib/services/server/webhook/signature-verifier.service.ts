/**
 * @fileoverview Webhook Signature Verification Service
 *
 * Handles webhook signature verification for security.
 */

import { logger } from '$lib/utils/logger';
import { env } from '$env/dynamic/private';
import type { WebhookPayload } from './types';

/**
 * Service for verifying webhook signatures
 */
export class SignatureVerifierService {
	/**
	 * Verify webhook signature for security
	 */
	async verifySignature(request: Request, payload: WebhookPayload): Promise<boolean> {
		try {
			const webhookSecret = env.ATOMIQ_WEBHOOK_SECRET;
			if (!webhookSecret) {
				return true; // Skip verification if no secret configured
			}

			const signature = request.headers.get('x-atomiq-signature');
			if (!signature) {
				return false;
			}

			// Create expected signature
			const encoder = new TextEncoder();
			const data = encoder.encode(JSON.stringify(payload));
			const key = await crypto.subtle.importKey(
				'raw',
				encoder.encode(webhookSecret),
				{ name: 'HMAC', hash: 'SHA-256' },
				false,
				['sign']
			);

			const expectedSignature = await crypto.subtle.sign('HMAC', key, data);
			const expectedHex = Array.from(new Uint8Array(expectedSignature))
				.map((b) => b.toString(16).padStart(2, '0'))
				.join('');

			const receivedSignature = signature.replace('sha256=', '');

			return expectedHex === receivedSignature;
		} catch (error) {
			logger.error('Webhook signature verification failed', error as Error);
			return false;
		}
	}

	/**
	 * Check if signature verification is enabled
	 */
	isVerificationEnabled(): boolean {
		return !!env.ATOMIQ_WEBHOOK_SECRET;
	}
}

// Export singleton instance
export const signatureVerifierService = new SignatureVerifierService();
