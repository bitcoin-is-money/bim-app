/**
 * @fileoverview Webhook Type Definitions
 *
 * Type definitions for webhook payloads and SSE events.
 */

/**
 * Webhook event types from Atomiq SDK
 */
export type WebhookEventType =
	| 'invoice_created'
	| 'payment_received'
	| 'payment_confirmed'
	| 'swap_initiated'
	| 'swap_completed'
	| 'swap_failed'
	| 'swap_expired';

/**
 * Webhook payload structure
 */
export interface WebhookPayload {
	event: WebhookEventType;
	swapId: string;
	timestamp: string;
	data: {
		amount?: number;
		destinationAsset?: string;
		starknetAddress?: string;
		txHash?: string;
		errorMessage?: string;
		progress?: number;
		status?: string;
	};
	signature?: string;
}

/**
 * SSE update data structure
 */
export interface SSEUpdateData {
	type:
		| 'connection'
		| 'heartbeat'
		| 'status_update'
		| 'claim_completed'
		| 'claim_failed'
		| 'claim_error';
	swapId?: string;
	status?: string;
	progress?: number;
	txHash?: string;
	error?: string;
	message?: string;
	timestamp: string;
}

/**
 * Swap status update data
 */
export interface SwapStatusUpdate {
	status: string;
	progress: number;
	txHash?: string;
	errorMessage?: string;
	timestamp: string;
}
