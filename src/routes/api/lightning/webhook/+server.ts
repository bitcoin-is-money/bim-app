/**
 * @fileoverview Lightning Webhook Handler (Refactored)
 *
 * This endpoint handles webhook notifications from the Atomiq SDK for Lightning
 * Bitcoin swap status updates. It processes incoming webhook events and updates
 * the real-time status monitoring system.
 *
 * Key Features:
 * - Webhook signature verification for security
 * - Real-time status updates via Server-Sent Events (SSE)
 * - Automatic retry handling for failed notifications
 * - Comprehensive logging and monitoring
 *
 * @deprecated Use imports from '$lib/services/server/webhook/' for new code
 * @author bim
 * @version 2.0.0
 */

import {
	eventProcessorService,
	signatureVerifierService,
	sseManagerService,
	type WebhookPayload
} from '$lib/services/server/webhook';
import { logger } from '$lib/utils/logger';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Handle incoming webhook from Atomiq SDK
 *
 * POST /api/lightning/webhook
 *
 * Processes webhook notifications from the Atomiq SDK and updates
 * the real-time status monitoring system via Server-Sent Events.
 *
 * @body WebhookPayload - Webhook event data
 * @returns 200 - Webhook processed successfully
 * @returns 400 - Invalid webhook payload
 * @returns 401 - Invalid webhook signature
 * @returns 500 - Internal server error
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const payload: WebhookPayload = await request.json();

		logger.info('Webhook received', {
			event: payload.event,
			swapId: payload.swapId,
			timestamp: payload.timestamp
		});

		// Validate webhook payload
		const validation = eventProcessorService.validatePayload(payload);
		if (!validation.valid) {
			logger.warn('Invalid webhook payload received', payload);
			return json(
				{
					error: 'Invalid payload',
					message: validation.error
				},
				{ status: 400 }
			);
		}

		// Verify webhook signature (if configured)
		if (signatureVerifierService.isVerificationEnabled()) {
			const isValid = await signatureVerifierService.verifySignature(request, payload);
			if (!isValid) {
				logger.warn('Invalid webhook signature', { swapId: payload.swapId });
				return json(
					{
						error: 'Invalid signature',
						message: 'Webhook signature verification failed'
					},
					{ status: 401 }
				);
			}
		}

		// Process webhook event
		await eventProcessorService.processEvent(payload);

		logger.info('Webhook processed successfully', {
			event: payload.event,
			swapId: payload.swapId
		});

		return json({
			success: true,
			message: 'Webhook processed successfully'
		});
	} catch (error) {
		logger.error('Webhook processing failed', error as Error);

		return json(
			{
				error: 'Webhook processing failed',
				message: 'Internal server error'
			},
			{ status: 500 }
		);
	}
};

/**
 * Handle Server-Sent Events connections
 *
 * GET /api/lightning/webhook?swapId=<swapId>
 *
 * Establishes a Server-Sent Events connection for real-time
 * status updates for a specific swap.
 *
 * @query swapId - Swap ID to monitor
 * @returns SSE stream - Real-time status updates
 * @returns 400 - Missing swap ID
 */
export const GET: RequestHandler = async ({ url }) => {
	const swapId = url.searchParams.get('swapId');

	if (!swapId) {
		return json(
			{
				error: 'Missing swapId',
				message: 'swapId parameter is required'
			},
			{ status: 400 }
		);
	}

	logger.info(`SSE connection requested for swap ${swapId}`);

	const stream = new ReadableStream({
		start(controller) {
			// Add connection to manager
			sseManagerService.addConnection(swapId, controller);

			// Send initial connection confirmation
			sseManagerService.sendConnectionConfirmation(swapId);
		},

		cancel() {
			sseManagerService.removeConnection(swapId);
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Headers': 'Cache-Control'
		}
	});
};
