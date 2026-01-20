/**
 * @fileoverview Lightning Metrics Collection Service
 *
 * Focused service for collecting and storing Lightning Network operation metrics.
 * Handles metric recording, storage, and basic aggregation.
 *
 * Key Features:
 * - Metric recording with timestamps and tags
 * - Response time tracking with percentile calculations
 * - Memory-efficient storage with automatic cleanup
 * - Performance metrics aggregation
 *
 * @author bim
 * @version 1.0.0
 */

import { logger } from '$lib/utils/logger';
import * as CONFIG from '$lib/constants/config.constants';

/**
 * Metric types for different Lightning operations
 */
export enum MetricType {
	// Payment metrics
	PAYMENT_CREATED = 'payment_created',
	PAYMENT_SUCCESS = 'payment_success',
	PAYMENT_FAILED = 'payment_failed',
	PAYMENT_TIMEOUT = 'payment_timeout',
	PAYMENT_EXPIRED = 'payment_expired',

	// Invoice metrics
	INVOICE_GENERATED = 'invoice_generated',
	INVOICE_SCANNED = 'invoice_scanned',
	QR_CODE_GENERATED = 'qr_code_generated',

	// Swap metrics
	SWAP_INITIATED = 'swap_initiated',
	SWAP_COMPLETED = 'swap_completed',
	SWAP_FAILED = 'swap_failed',
	SWAP_CANCELLED = 'swap_cancelled',

	// Quote metrics
	QUOTE_REQUESTED = 'quote_requested',
	QUOTE_SUCCESS = 'quote_success',
	QUOTE_FAILED = 'quote_failed',

	// System metrics
	SERVICE_HEALTH_CHECK = 'service_health_check',
	CIRCUIT_BREAKER_OPENED = 'circuit_breaker_opened',
	CIRCUIT_BREAKER_CLOSED = 'circuit_breaker_closed',

	// Webhook metrics
	WEBHOOK_RECEIVED = 'webhook_received',
	WEBHOOK_PROCESSED = 'webhook_processed',
	WEBHOOK_FAILED = 'webhook_failed',
	SSE_CONNECTION_OPENED = 'sse_connection_opened',
	SSE_CONNECTION_CLOSED = 'sse_connection_closed',

	// Pricing metrics
	PRICE_FETCHED = 'price_fetched',
	PRICE_CACHE_HIT = 'price_cache_hit',
	PRICE_CACHE_MISS = 'price_cache_miss',
	PRICE_FETCH_FAILED = 'price_fetch_failed'
}

/**
 * Metric data structure
 */
export interface MetricData {
	type: MetricType;
	timestamp: number;
	value: number;
	tags: Record<string, string>;
	metadata?: Record<string, any>;
}

/**
 * Performance metrics aggregation
 */
export interface PerformanceMetrics {
	requestCount: number;
	errorCount: number;
	errorRate: number;
	averageResponseTime: number;
	p95ResponseTime: number;
	p99ResponseTime: number;
	throughput: number; // requests per second
	lastUpdated: number;
}

/**
 * Lightning Metrics Collection Service
 */
export class MetricsCollectorService {
	private metrics: MetricData[] = [];
	private responseTimes: number[] = [];
	private readonly maxMetrics = CONFIG.MONITORING.MAX_METRICS; // Keep last 10k metrics
	private readonly maxResponseTimes = CONFIG.MONITORING.MAX_RESPONSE_SAMPLES; // Keep last 1k response times

	/**
	 * Record a metric
	 */
	recordMetric(
		type: MetricType,
		value: number = 1,
		tags: Record<string, string> = {},
		metadata?: Record<string, any>
	): void {
		const metric: MetricData = {
			type,
			timestamp: Date.now(),
			value,
			tags,
			metadata
		};

		this.metrics.push(metric);

		// Keep only recent metrics
		if (this.metrics.length > this.maxMetrics) {
			this.metrics.shift();
		}

		// Log debug info
		logger.debug('Metric recorded', {
			type,
			value,
			tags,
			metadata
		});
	}

	/**
	 * Record response time
	 */
	recordResponseTime(duration: number, operation: string): void {
		this.responseTimes.push(duration);

		if (this.responseTimes.length > this.maxResponseTimes) {
			this.responseTimes.shift();
		}

		this.recordMetric(MetricType.SERVICE_HEALTH_CHECK, duration, {
			operation,
			type: 'response_time'
		});
	}

	/**
	 * Record Lightning payment event
	 */
	recordPaymentEvent(
		event: 'created' | 'success' | 'failed' | 'timeout' | 'expired',
		swapId: string,
		amount: number,
		asset: string,
		metadata?: Record<string, any>
	): void {
		const metricType = this.getPaymentMetricType(event);

		this.recordMetric(
			metricType,
			1,
			{
				swapId,
				asset,
				event
			},
			{
				amount,
				...metadata
			}
		);

		logger.info(`Lightning payment ${event}`, {
			swapId,
			amount,
			asset,
			event
		});
	}

	/**
	 * Record swap event
	 */
	recordSwapEvent(
		event: 'initiated' | 'completed' | 'failed' | 'cancelled',
		swapId: string,
		direction: 'lightning_to_starknet' | 'starknet_to_lightning',
		metadata?: Record<string, any>
	): void {
		const metricType = this.getSwapMetricType(event);

		this.recordMetric(
			metricType,
			1,
			{
				swapId,
				direction,
				event
			},
			metadata
		);

		logger.info(`Lightning swap ${event}`, {
			swapId,
			direction,
			event
		});
	}

	/**
	 * Record quote event
	 */
	recordQuoteEvent(
		event: 'requested' | 'success' | 'failed',
		amount: number,
		asset: string,
		metadata?: Record<string, any>
	): void {
		const metricType = this.getQuoteMetricType(event);

		this.recordMetric(
			metricType,
			1,
			{
				asset,
				event
			},
			{
				amount,
				...metadata
			}
		);
	}

	/**
	 * Record webhook event
	 */
	recordWebhookEvent(
		event: 'received' | 'processed' | 'failed',
		type: string,
		metadata?: Record<string, any>
	): void {
		const metricType = this.getWebhookMetricType(event);

		this.recordMetric(
			metricType,
			1,
			{
				webhookType: type,
				event
			},
			metadata
		);
	}

	/**
	 * Record SSE connection event
	 */
	recordSSEEvent(
		event: 'opened' | 'closed',
		connectionId: string,
		metadata?: Record<string, any>
	): void {
		const metricType =
			event === 'opened' ? MetricType.SSE_CONNECTION_OPENED : MetricType.SSE_CONNECTION_CLOSED;

		this.recordMetric(
			metricType,
			1,
			{
				connectionId,
				event
			},
			metadata
		);
	}

	/**
	 * Record pricing event
	 */
	recordPricingEvent(
		event: 'fetched' | 'cache_hit' | 'cache_miss' | 'failed',
		asset: string,
		metadata?: Record<string, any>
	): void {
		const metricType = this.getPricingMetricType(event);

		this.recordMetric(
			metricType,
			1,
			{
				asset,
				event
			},
			metadata
		);
	}

	/**
	 * Get metrics within a time range
	 */
	getMetrics(startTime?: number, endTime?: number, type?: MetricType): MetricData[] {
		let filteredMetrics = this.metrics;

		if (startTime) {
			filteredMetrics = filteredMetrics.filter((m) => m.timestamp >= startTime);
		}

		if (endTime) {
			filteredMetrics = filteredMetrics.filter((m) => m.timestamp <= endTime);
		}

		if (type) {
			filteredMetrics = filteredMetrics.filter((m) => m.type === type);
		}

		return filteredMetrics;
	}

	/**
	 * Get performance metrics
	 */
	getPerformanceMetrics(windowMs: number = 300000): PerformanceMetrics {
		const now = Date.now();
		const windowStart = now - windowMs;

		const recentMetrics = this.getMetrics(windowStart, now);
		const recentResponseTimes = this.responseTimes.filter((t) => t >= windowStart);

		const requestCount = recentMetrics.filter(
			(m) => m.type === MetricType.SERVICE_HEALTH_CHECK
		).length;

		const errorCount = recentMetrics.filter(
			(m) =>
				m.type.toString().includes('failed') ||
				m.type.toString().includes('timeout') ||
				m.type.toString().includes('expired')
		).length;

		const errorRate = requestCount > 0 ? errorCount / requestCount : 0;

		const averageResponseTime =
			recentResponseTimes.length > 0
				? recentResponseTimes.reduce((sum, time) => sum + time, 0) / recentResponseTimes.length
				: 0;

		const sortedResponseTimes = [...recentResponseTimes].sort((a, b) => a - b);
		const p95Index = Math.floor(sortedResponseTimes.length * 0.95);
		const p99Index = Math.floor(sortedResponseTimes.length * 0.99);

		const p95ResponseTime = sortedResponseTimes[p95Index] || 0;
		const p99ResponseTime = sortedResponseTimes[p99Index] || 0;

		const throughput = requestCount / (windowMs / 1000); // requests per second

		return {
			requestCount,
			errorCount,
			errorRate,
			averageResponseTime,
			p95ResponseTime,
			p99ResponseTime,
			throughput,
			lastUpdated: now
		};
	}

	/**
	 * Get metric counts by type
	 */
	getMetricCounts(windowMs: number = 300000): Record<string, number> {
		const now = Date.now();
		const windowStart = now - windowMs;
		const recentMetrics = this.getMetrics(windowStart, now);

		const counts: Record<string, number> = {};

		for (const metric of recentMetrics) {
			counts[metric.type] = (counts[metric.type] || 0) + metric.value;
		}

		return counts;
	}

	/**
	 * Clear old metrics
	 */
	clearMetrics(olderThan?: number): void {
		if (olderThan) {
			this.metrics = this.metrics.filter((m) => m.timestamp >= olderThan);
			logger.info('Cleared old metrics', {
				olderThan,
				remaining: this.metrics.length
			});
		} else {
			this.metrics = [];
			this.responseTimes = [];
			logger.info('Cleared all metrics');
		}
	}

	// Private helper methods

	private getPaymentMetricType(event: string): MetricType {
		switch (event) {
			case 'created':
				return MetricType.PAYMENT_CREATED;
			case 'success':
				return MetricType.PAYMENT_SUCCESS;
			case 'failed':
				return MetricType.PAYMENT_FAILED;
			case 'timeout':
				return MetricType.PAYMENT_TIMEOUT;
			case 'expired':
				return MetricType.PAYMENT_EXPIRED;
			default:
				return MetricType.PAYMENT_FAILED;
		}
	}

	private getSwapMetricType(event: string): MetricType {
		switch (event) {
			case 'initiated':
				return MetricType.SWAP_INITIATED;
			case 'completed':
				return MetricType.SWAP_COMPLETED;
			case 'failed':
				return MetricType.SWAP_FAILED;
			case 'cancelled':
				return MetricType.SWAP_CANCELLED;
			default:
				return MetricType.SWAP_FAILED;
		}
	}

	private getQuoteMetricType(event: string): MetricType {
		switch (event) {
			case 'requested':
				return MetricType.QUOTE_REQUESTED;
			case 'success':
				return MetricType.QUOTE_SUCCESS;
			case 'failed':
				return MetricType.QUOTE_FAILED;
			default:
				return MetricType.QUOTE_FAILED;
		}
	}

	private getWebhookMetricType(event: string): MetricType {
		switch (event) {
			case 'received':
				return MetricType.WEBHOOK_RECEIVED;
			case 'processed':
				return MetricType.WEBHOOK_PROCESSED;
			case 'failed':
				return MetricType.WEBHOOK_FAILED;
			default:
				return MetricType.WEBHOOK_FAILED;
		}
	}

	private getPricingMetricType(event: string): MetricType {
		switch (event) {
			case 'fetched':
				return MetricType.PRICE_FETCHED;
			case 'cache_hit':
				return MetricType.PRICE_CACHE_HIT;
			case 'cache_miss':
				return MetricType.PRICE_CACHE_MISS;
			case 'failed':
				return MetricType.PRICE_FETCH_FAILED;
			default:
				return MetricType.PRICE_FETCH_FAILED;
		}
	}
}
