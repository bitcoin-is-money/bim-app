/**
 * @fileoverview Lightning Monitoring Service Orchestrator
 *
 * This service orchestrates Lightning Network monitoring operations by delegating to
 * specialized services. It provides a unified interface for metrics collection,
 * alerting, and health monitoring while maintaining single responsibility.
 *
 * Key Features:
 * - Orchestrates specialized monitoring services (metrics, alerts, health)
 * - Provides unified monitoring interface
 * - Maintains backward compatibility with existing API
 * - Delegates to focused, testable service modules
 * - Real-time metrics collection and alerting
 *
 * @requires ./lightning-monitoring - Specialized monitoring service modules
 * @requires $lib/utils/logger - Logging utilities
 * @requires $lib/utils/monitoring - Monitoring integration
 *
 * @author bim
 * @version 2.0.0
 */

import { logger } from '$lib/utils/logger';

// Import specialized services and types
import {
	type ActiveAlert,
	type AlertConfig,
	AlertingService,
	type HealthCheckConfig,
	HealthMonitorService,
	type MetricData,
	MetricsCollectorService,
	MetricType,
	type PerformanceMetrics,
	type ServiceHealth,
	type SystemHealth
} from './lightning-monitoring';

/**
 * Re-export types for backward compatibility
 */
export type {
	ActiveAlert,
	AlertConfig,
	HealthCheckConfig,
	MetricData,
	PerformanceMetrics,
	ServiceHealth,
	SystemHealth
};

export { MetricType };

/**
 * Lightning Monitoring Service Orchestrator
 *
 * Coordinates metrics collection, alerting, and health monitoring
 * for Lightning Network operations.
 */
export class LightningMonitoringService {
	private static instance: LightningMonitoringService;

	// Specialized service instances
	private metricsCollector: MetricsCollectorService;
	private alertingService: AlertingService;
	private healthMonitor: HealthMonitorService;

	// Periodic task timers
	private alertCheckInterval?: NodeJS.Timeout | undefined;
	private metricsCleanupInterval?: NodeJS.Timeout | undefined;

	private constructor() {
		// Initialize specialized services
		this.metricsCollector = new MetricsCollectorService();
		this.alertingService = new AlertingService();
		this.healthMonitor = new HealthMonitorService();

		this.startPeriodicTasks();

		logger.info('Lightning Monitoring Service orchestrator initialized');
	}

	/**
	 * Get singleton instance
	 */
	static getInstance(): LightningMonitoringService {
		if (!LightningMonitoringService.instance) {
			LightningMonitoringService.instance = new LightningMonitoringService();
		}
		return LightningMonitoringService.instance;
	}

	// ========================================
	// Metrics Operations (delegate to MetricsCollectorService)
	// ========================================

	/**
	 * Record a metric
	 */
	recordMetric(
		type: MetricType,
		value: number = 1,
		tags: Record<string, string> = {},
		metadata?: Record<string, any>
	): void {
		try {
			this.metricsCollector.recordMetric(type, value, tags, metadata);

			// Check alerts after recording metric
			const metric: MetricData = {
				type,
				timestamp: Date.now(),
				value,
				tags,
				metadata: metadata || {}
			};

			this.alertingService.checkMetric(metric);
		} catch (error) {
			logger.error('Failed to record metric', error as Error, {
				type,
				value,
				tags
			});
		}
	}

	/**
	 * Record response time
	 */
	recordResponseTime(duration: number, operation: string): void {
		try {
			this.metricsCollector.recordResponseTime(duration, operation);

			// Update service health with response time
			this.healthMonitor.updateServiceHealth(
				operation,
				duration,
				0, // No error for successful response
				{ operation, responseTime: duration }
			);
		} catch (error) {
			logger.error('Failed to record response time', error as Error, {
				duration,
				operation
			});
		}
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
		try {
			this.metricsCollector.recordPaymentEvent(event, swapId, amount, asset, metadata);

			// Update service health based on payment events
			const errorRate = event === 'failed' || event === 'timeout' || event === 'expired' ? 1 : 0;
			this.healthMonitor.updateServiceHealth('lightning', 0, errorRate, {
				lastEvent: event
			});
		} catch (error) {
			logger.error('Failed to record payment event', error as Error, {
				event,
				swapId,
				amount,
				asset
			});
		}
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
		try {
			this.metricsCollector.recordSwapEvent(event, swapId, direction, metadata);
		} catch (error) {
			logger.error('Failed to record swap event', error as Error, {
				event,
				swapId,
				direction
			});
		}
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
		try {
			this.metricsCollector.recordQuoteEvent(event, amount, asset, metadata);
		} catch (error) {
			logger.error('Failed to record quote event', error as Error, {
				event,
				amount,
				asset
			});
		}
	}

	/**
	 * Record webhook event
	 */
	recordWebhookEvent(
		event: 'received' | 'processed' | 'failed',
		type: string,
		metadata?: Record<string, any>
	): void {
		try {
			this.metricsCollector.recordWebhookEvent(event, type, metadata);

			// Update webhook service health
			const errorRate = event === 'failed' ? 1 : 0;
			this.healthMonitor.updateServiceHealth('webhook', 0, errorRate, {
				lastEvent: event
			});
		} catch (error) {
			logger.error('Failed to record webhook event', error as Error, {
				event,
				type
			});
		}
	}

	/**
	 * Record SSE connection event
	 */
	recordSSEEvent(
		event: 'opened' | 'closed',
		connectionId: string,
		metadata?: Record<string, any>
	): void {
		try {
			this.metricsCollector.recordSSEEvent(event, connectionId, metadata);
		} catch (error) {
			logger.error('Failed to record SSE event', error as Error, {
				event,
				connectionId
			});
		}
	}

	/**
	 * Record pricing event
	 */
	recordPricingEvent(
		event: 'fetched' | 'cache_hit' | 'cache_miss' | 'failed',
		asset: string,
		metadata?: Record<string, any>
	): void {
		try {
			this.metricsCollector.recordPricingEvent(event, asset, metadata);

			// Update pricing service health
			const errorRate = event === 'failed' ? 1 : 0;
			this.healthMonitor.updateServiceHealth('pricing', 0, errorRate, {
				lastEvent: event
			});
		} catch (error) {
			logger.error('Failed to record pricing event', error as Error, {
				event,
				asset
			});
		}
	}

	/**
	 * Get performance metrics
	 */
	getPerformanceMetrics(windowMs: number = 300000): PerformanceMetrics {
		try {
			return this.metricsCollector.getPerformanceMetrics(windowMs);
		} catch (error) {
			logger.error('Failed to get performance metrics', error as Error);

			// Return default metrics on error
			return {
				requestCount: 0,
				errorCount: 0,
				errorRate: 0,
				averageResponseTime: 0,
				p95ResponseTime: 0,
				p99ResponseTime: 0,
				throughput: 0,
				lastUpdated: Date.now()
			};
		}
	}

	/**
	 * Get metric counts by type
	 */
	getMetricCounts(windowMs: number = 300000): Record<string, number> {
		try {
			return this.metricsCollector.getMetricCounts(windowMs);
		} catch (error) {
			logger.error('Failed to get metric counts', error as Error);
			return {};
		}
	}

	// ========================================
	// Alerting Operations (delegate to AlertingService)
	// ========================================

	/**
	 * Add or update alert configuration
	 */
	addAlert(config: AlertConfig): void {
		try {
			this.alertingService.addAlert(config);
		} catch (error) {
			logger.error('Failed to add alert configuration', error as Error, {
				configId: config.id
			});
		}
	}

	/**
	 * Remove alert configuration
	 */
	removeAlert(alertId: string): boolean {
		try {
			return this.alertingService.removeAlert(alertId);
		} catch (error) {
			logger.error('Failed to remove alert configuration', error as Error, {
				alertId
			});
			return false;
		}
	}

	/**
	 * Get all alert configurations
	 */
	getAlerts(): AlertConfig[] {
		try {
			return this.alertingService.getAlerts();
		} catch (error) {
			logger.error('Failed to get alert configurations', error as Error);
			return [];
		}
	}

	/**
	 * Get active alerts
	 */
	getActiveAlerts(): ActiveAlert[] {
		try {
			return this.alertingService.getActiveAlerts();
		} catch (error) {
			logger.error('Failed to get active alerts', error as Error);
			return [];
		}
	}

	/**
	 * Enable or disable an alert
	 */
	setAlertEnabled(alertId: string, enabled: boolean): boolean {
		try {
			return this.alertingService.setAlertEnabled(alertId, enabled);
		} catch (error) {
			logger.error('Failed to set alert enabled state', error as Error, {
				alertId,
				enabled
			});
			return false;
		}
	}

	/**
	 * Manually trigger an alert
	 */
	triggerAlert(
		configId: string,
		message: string,
		value: number,
		metadata?: Record<string, any>
	): ActiveAlert | null {
		try {
			return this.alertingService.triggerAlert(configId, message, value, metadata);
		} catch (error) {
			logger.error('Failed to trigger alert', error as Error, {
				configId,
				message,
				value
			});
			return null;
		}
	}

	/**
	 * Clear active alerts
	 */
	clearActiveAlerts(configId?: string): void {
		try {
			this.alertingService.clearActiveAlerts(configId);
		} catch (error) {
			logger.error('Failed to clear active alerts', error as Error, {
				configId
			});
		}
	}

	// ========================================
	// Health Monitoring Operations (delegate to HealthMonitorService)
	// ========================================

	/**
	 * Get overall system health
	 */
	getSystemHealth(): SystemHealth {
		try {
			const performanceMetrics = this.getPerformanceMetrics();
			const activeAlerts = this.getActiveAlerts();

			return this.healthMonitor.getSystemHealth(performanceMetrics, activeAlerts);
		} catch (error) {
			logger.error('Failed to get system health', error as Error);

			// Return minimal health status on error
			return {
				status: 'unhealthy',
				timestamp: Date.now(),
				services: {
					lightning: {
						name: 'lightning',
						status: 'unhealthy',
						responseTime: 0,
						errorRate: 1,
						lastCheck: Date.now()
					},
					pricing: {
						name: 'pricing',
						status: 'unhealthy',
						responseTime: 0,
						errorRate: 1,
						lastCheck: Date.now()
					},
					webhook: {
						name: 'webhook',
						status: 'unhealthy',
						responseTime: 0,
						errorRate: 1,
						lastCheck: Date.now()
					}
				},
				circuitBreakers: {},
				alerts: { active: 0, recent: [] },
				performance: this.getPerformanceMetrics(),
				uptime: 0
			};
		}
	}

	/**
	 * Check specific service health
	 */
	async checkServiceHealth(serviceName: string): Promise<ServiceHealth> {
		try {
			return await this.healthMonitor.checkServiceHealth(serviceName);
		} catch (error) {
			logger.error('Failed to check service health', error as Error, {
				serviceName
			});

			return {
				name: serviceName,
				status: 'unhealthy',
				responseTime: 0,
				errorRate: 1,
				lastCheck: Date.now(),
				metadata: { error: (error as Error).message }
			};
		}
	}

	/**
	 * Update health check configuration
	 */
	updateHealthConfig(config: Partial<HealthCheckConfig>): void {
		try {
			this.healthMonitor.updateConfig(config);
		} catch (error) {
			logger.error('Failed to update health check configuration', error as Error, config);
		}
	}

	// ========================================
	// Service Management
	// ========================================

	/**
	 * Start periodic monitoring tasks
	 */
	private startPeriodicTasks(): void {
		// Start alert checking (every 30 seconds)
		this.alertCheckInterval = setInterval(() => {
			this.performAlertCheck();
		}, 30000);

		// Start metrics cleanup (every hour)
		this.metricsCleanupInterval = setInterval(() => {
			this.performMetricsCleanup();
		}, 3600000);

		logger.info('Lightning monitoring periodic tasks started');
	}

	/**
	 * Stop periodic monitoring tasks
	 */
	stopPeriodicTasks(): void {
		if (this.alertCheckInterval) {
			clearInterval(this.alertCheckInterval);
			this.alertCheckInterval = undefined;
		}

		if (this.metricsCleanupInterval) {
			clearInterval(this.metricsCleanupInterval);
			this.metricsCleanupInterval = undefined;
		}

		this.healthMonitor.stopHealthChecks();

		logger.info('Lightning monitoring periodic tasks stopped');
	}

	/**
	 * Perform periodic alert check
	 */
	private performAlertCheck(): void {
		try {
			const metrics = this.metricsCollector.getMetrics(Date.now() - 300000); // Last 5 minutes
			this.alertingService.checkAlerts(metrics);
		} catch (error) {
			logger.warn('Periodic alert check failed', error as Error);
		}
	}

	/**
	 * Perform periodic metrics cleanup
	 */
	private performMetricsCleanup(): void {
		try {
			const oneHourAgo = Date.now() - 3600000;
			this.metricsCollector.clearMetrics(oneHourAgo);
		} catch (error) {
			logger.warn('Periodic metrics cleanup failed', error as Error);
		}
	}

	/**
	 * Get monitoring service statistics
	 */
	getMonitoringStatistics(): {
		metrics: { totalCount: number; typeCounts: Record<string, number> };
		alerts: { totalConfigs: number; activeAlerts: number };
		health: { servicesMonitored: number; overallStatus: string };
	} {
		try {
			const metricCounts = this.getMetricCounts();
			const totalMetrics = Object.values(metricCounts).reduce((sum, count) => sum + count, 0);

			const alerts = this.getAlerts();
			const activeAlerts = this.getActiveAlerts();

			const systemHealth = this.getSystemHealth();
			const servicesMonitored = Object.keys(systemHealth.services).length;

			return {
				metrics: {
					totalCount: totalMetrics,
					typeCounts: metricCounts
				},
				alerts: {
					totalConfigs: alerts.length,
					activeAlerts: activeAlerts.length
				},
				health: {
					servicesMonitored,
					overallStatus: systemHealth.status
				}
			};
		} catch (error) {
			logger.error('Failed to get monitoring statistics', error as Error);
			return {
				metrics: { totalCount: 0, typeCounts: {} },
				alerts: { totalConfigs: 0, activeAlerts: 0 },
				health: { servicesMonitored: 0, overallStatus: 'unknown' }
			};
		}
	}
}

/**
 * Default export for singleton access
 */
export const lightningMonitoringService = LightningMonitoringService.getInstance();
