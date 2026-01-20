/**
 * @fileoverview Server-Sent Events Manager Service
 *
 * Manages SSE connections for real-time webhook updates.
 */

import { logger } from '$lib/utils/logger';
import type { SSEUpdateData } from './types';

/**
 * Server-Sent Events connection manager
 */
export class SSEManagerService {
	private static instance: SSEManagerService;
	private connections = new Map<string, ReadableStreamDefaultController>();
	private heartbeatIntervals = new Map<string, NodeJS.Timeout>();

	static getInstance(): SSEManagerService {
		if (!SSEManagerService.instance) {
			SSEManagerService.instance = new SSEManagerService();
		}
		return SSEManagerService.instance;
	}

	/**
	 * Add SSE connection for a swap
	 */
	addConnection(swapId: string, controller: ReadableStreamDefaultController): void {
		this.connections.set(swapId, controller);
		this.startHeartbeat(swapId, controller);
		logger.info(`SSE connection added for swap ${swapId}`);
	}

	/**
	 * Remove SSE connection
	 */
	removeConnection(swapId: string): void {
		const controller = this.connections.get(swapId);
		if (controller) {
			try {
				controller.close();
			} catch (error) {
				logger.warn(`Failed to close SSE connection for swap ${swapId}`, error as Error);
			}
			this.connections.delete(swapId);
		}

		// Clear heartbeat interval
		const interval = this.heartbeatIntervals.get(swapId);
		if (interval) {
			clearInterval(interval);
			this.heartbeatIntervals.delete(swapId);
		}

		logger.info(`SSE connection removed for swap ${swapId}`);
	}

	/**
	 * Send update to specific swap connection
	 */
	sendUpdate(swapId: string, data: SSEUpdateData): void {
		const controller = this.connections.get(swapId);
		if (controller) {
			try {
				const message = `data: ${JSON.stringify(data)}\n\n`;
				controller.enqueue(new TextEncoder().encode(message));
				logger.info(`SSE update sent for swap ${swapId}`, { data });
			} catch (error) {
				logger.error(`Failed to send SSE update for swap ${swapId}`, error as Error);
				this.removeConnection(swapId);
			}
		}
	}

	/**
	 * Send initial connection confirmation
	 */
	sendConnectionConfirmation(swapId: string): void {
		const data: SSEUpdateData = {
			type: 'connection',
			swapId,
			timestamp: new Date().toISOString(),
			message: 'Connected to real-time updates'
		};

		this.sendUpdate(swapId, data);
	}

	/**
	 * Start heartbeat for connection
	 */
	private startHeartbeat(swapId: string, controller: ReadableStreamDefaultController): void {
		const interval = setInterval(() => {
			try {
				const heartbeat: SSEUpdateData = {
					type: 'heartbeat',
					timestamp: new Date().toISOString()
				};

				const message = `data: ${JSON.stringify(heartbeat)}\n\n`;
				controller.enqueue(new TextEncoder().encode(message));
			} catch (error) {
				this.removeConnection(swapId);
			}
		}, 30000); // 30 seconds

		this.heartbeatIntervals.set(swapId, interval);
	}

	/**
	 * Get active connection count
	 */
	getConnectionCount(): number {
		return this.connections.size;
	}

	/**
	 * Check if connection exists for swap
	 */
	hasConnection(swapId: string): boolean {
		return this.connections.has(swapId);
	}

	/**
	 * Clean up all connections
	 */
	cleanup(): void {
		// Close all connections
		for (const [swapId] of this.connections) {
			this.removeConnection(swapId);
		}

		// Clear all intervals
		for (const interval of this.heartbeatIntervals.values()) {
			clearInterval(interval);
		}
		this.heartbeatIntervals.clear();
	}
}

// Export singleton instance
export const sseManagerService = SSEManagerService.getInstance();
