/**
 * @fileoverview Lightning Health Monitoring Service
 *
 * Focused service for monitoring system health across Lightning Network components.
 * Tracks service status, circuit breaker states, and overall system health.
 *
 * Key Features:
 * - Service health status tracking
 * - Circuit breaker state monitoring
 * - System health aggregation
 * - Health check coordination
 * - Performance threshold monitoring
 *
 * @author bim
 * @version 1.0.0
 */

import { ErrorSeverity } from '$lib/errors/lightning';
import { logger } from '$lib/utils/logger';
import { clientCircuitBreakerManager } from '$lib/utils/network/circuit-breaker-client';
import type { PerformanceMetrics } from './metrics-collector.service';

/**
 * Service health status
 */
export interface ServiceHealth {
	name: string;
	status: 'healthy' | 'degraded' | 'unhealthy';
	responseTime: number;
	errorRate: number;
	lastCheck: number;
	metadata?: Record<string, any>;
}

/**
 * Circuit breaker status
 */
export interface CircuitBreakerStatus {
	name: string;
	state: 'closed' | 'open' | 'half-open';
	failures: number;
	lastFailure: number | null;
	nextRetry: number | null;
	metadata?: Record<string, any>;
}

/**
 * System health status
 */
export interface SystemHealth {
	status: 'healthy' | 'degraded' | 'unhealthy';
	timestamp: number;
	services: {
		lightning: ServiceHealth;
		pricing: ServiceHealth;
		webhook: ServiceHealth;
		atomiq?: ServiceHealth;
	};
	circuitBreakers: Record<string, CircuitBreakerStatus>;
	alerts: {
		active: number;
		recent: Array<{
			id: string;
			severity: ErrorSeverity;
			message: string;
			timestamp: number;
		}>;
	};
	performance: PerformanceMetrics;
	uptime: number;
}

/**
 * Health check configuration
 */
export interface HealthCheckConfig {
	interval: number; // Check interval in milliseconds
	timeout: number; // Timeout for health checks
	retries: number; // Number of retries before marking unhealthy
	degradedThreshold: number; // Response time threshold for degraded status
	unhealthyThreshold: number; // Response time threshold for unhealthy status
}

/**
 * Lightning Health Monitoring Service
 */
export class HealthMonitorService {
	private services: Map<string, ServiceHealth> = new Map();
	private startTime: number = Date.now();
	private healthCheckInterval?: NodeJS.Timeout;

	private config: HealthCheckConfig = {
		interval: 30000, // 30 seconds
		timeout: 5000, // 5 seconds
		retries: 3,
		degradedThreshold: 1000, // 1 second
		unhealthyThreshold: 5000 // 5 seconds
	};

	constructor(config?: Partial<HealthCheckConfig>) {
		if (config) {
			this.config = { ...this.config, ...config };
		}

		this.initializeServices();
		this.startHealthChecks();
	}

	/**
	 * Get overall system health
	 */
	getSystemHealth(performanceMetrics: PerformanceMetrics, activeAlerts: any[] = []): SystemHealth {
		const services = {
			lightning: this.services.get('lightning') || this.createDefaultServiceHealth('lightning'),
			pricing: this.services.get('pricing') || this.createDefaultServiceHealth('pricing'),
			webhook: this.services.get('webhook') || this.createDefaultServiceHealth('webhook'),
			...(this.services.get('atomiq') && {
				atomiq: this.services.get('atomiq')
			})
		};

		const circuitBreakers = this.getCircuitBreakerStatuses();

		// Determine overall status based on service health
		const serviceStatuses = Object.values(services)
			.filter((s) => s) // Filter out undefined services
			.map((s) => s!.status);

		let overallStatus: 'healthy' | 'degraded' | 'unhealthy';

		if (serviceStatuses.some((status) => status === 'unhealthy')) {
			overallStatus = 'unhealthy';
		} else if (serviceStatuses.some((status) => status === 'degraded')) {
			overallStatus = 'degraded';
		} else {
			overallStatus = 'healthy';
		}

		// Factor in circuit breaker states
		const openCircuitBreakers = Object.values(circuitBreakers).filter((cb) => cb.state === 'open');

		if (openCircuitBreakers.length > 0) {
			overallStatus = 'degraded';
		}

		return {
			status: overallStatus,
			timestamp: Date.now(),
			services,
			circuitBreakers,
			alerts: {
				active: activeAlerts.length,
				recent: activeAlerts.slice(-5).map((alert) => ({
					id: alert.id,
					severity: alert.severity,
					message: alert.message,
					timestamp: alert.timestamp
				}))
			},
			performance: performanceMetrics,
			uptime: Date.now() - this.startTime
		};
	}

	/**
	 * Update service health status
	 */
	updateServiceHealth(
		serviceName: string,
		responseTime: number,
		errorRate: number,
		metadata?: Record<string, any>
	): void {
		const status = this.determineServiceStatus(responseTime, errorRate);

		const serviceHealth: ServiceHealth = {
			name: serviceName,
			status,
			responseTime,
			errorRate,
			lastCheck: Date.now(),
			metadata
		};

		this.services.set(serviceName, serviceHealth);

		logger.debug('Service health updated', {
			serviceName,
			status,
			responseTime,
			errorRate
		});
	}

	/**
	 * Manually check service health
	 */
	async checkServiceHealth(serviceName: string): Promise<ServiceHealth> {
		const startTime = Date.now();
		let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
		let errorRate = 0;
		let metadata: Record<string, any> = {};

		try {
			// Perform service-specific health check
			switch (serviceName) {
				case 'lightning':
					metadata = await this.checkLightningHealth();
					break;
				case 'pricing':
					metadata = await this.checkPricingHealth();
					break;
				case 'webhook':
					metadata = await this.checkWebhookHealth();
					break;
				case 'atomiq':
					metadata = await this.checkAtomiqHealth();
					break;
				default:
					throw new Error(`Unknown service: ${serviceName}`);
			}
		} catch (error) {
			status = 'unhealthy';
			errorRate = 1;
			metadata = { error: (error as Error).message };

			logger.warn('Service health check failed', {
				serviceName,
				error: (error as Error).message
			});
		}

		const responseTime = Date.now() - startTime;

		if (status === 'healthy') {
			status = this.determineServiceStatus(responseTime, errorRate);
		}

		const serviceHealth: ServiceHealth = {
			name: serviceName,
			status,
			responseTime,
			errorRate,
			lastCheck: Date.now(),
			metadata
		};

		this.services.set(serviceName, serviceHealth);
		return serviceHealth;
	}

	/**
	 * Get circuit breaker statuses
	 */
	getCircuitBreakerStatuses(): Record<string, CircuitBreakerStatus> {
		const circuitBreakers: Record<string, CircuitBreakerStatus> = {};

		try {
			// Get circuit breaker information from circuit breaker manager
			const breakerStates = clientCircuitBreakerManager.getAllStats();

			for (const [name, state] of Object.entries(breakerStates)) {
				circuitBreakers[name] = {
					name,
					state: state.state as 'closed' | 'open' | 'half-open',
					failures: state.failures || 0,
					lastFailure: state.lastFailure || null,
					nextRetry: state.nextRetry || null,
					metadata: state.metadata
				};
			}
		} catch (error) {
			logger.warn('Failed to get circuit breaker statuses', error as Error);
		}

		return circuitBreakers;
	}

	/**
	 * Start periodic health checks
	 */
	startHealthChecks(): void {
		if (this.healthCheckInterval) {
			clearInterval(this.healthCheckInterval);
		}

		this.healthCheckInterval = setInterval(async () => {
			try {
				await this.performPeriodicHealthChecks();
			} catch (error) {
				logger.warn('Periodic health check failed', error as Error);
			}
		}, this.config.interval);

		logger.info('Health checks started', {
			interval: this.config.interval,
			timeout: this.config.timeout
		});
	}

	/**
	 * Stop periodic health checks
	 */
	stopHealthChecks(): void {
		if (this.healthCheckInterval) {
			clearInterval(this.healthCheckInterval);
			this.healthCheckInterval = undefined;
		}

		logger.info('Health checks stopped');
	}

	/**
	 * Update health check configuration
	 */
	updateConfig(config: Partial<HealthCheckConfig>): void {
		this.config = { ...this.config, ...config };

		// Restart health checks with new configuration
		this.startHealthChecks();

		logger.info('Health check configuration updated', this.config);
	}

	// Private methods

	/**
	 * Initialize default service health status
	 */
	private initializeServices(): void {
		const defaultServices = ['lightning', 'pricing', 'webhook'];

		for (const serviceName of defaultServices) {
			this.services.set(serviceName, this.createDefaultServiceHealth(serviceName));
		}
	}

	/**
	 * Create default service health object
	 */
	private createDefaultServiceHealth(serviceName: string): ServiceHealth {
		return {
			name: serviceName,
			status: 'healthy',
			responseTime: 0,
			errorRate: 0,
			lastCheck: Date.now()
		};
	}

	/**
	 * Determine service status based on response time and error rate
	 */
	private determineServiceStatus(
		responseTime: number,
		errorRate: number
	): 'healthy' | 'degraded' | 'unhealthy' {
		if (errorRate > 0.5 || responseTime > this.config.unhealthyThreshold) {
			return 'unhealthy';
		} else if (errorRate > 0.1 || responseTime > this.config.degradedThreshold) {
			return 'degraded';
		} else {
			return 'healthy';
		}
	}

	/**
	 * Perform periodic health checks for all services
	 */
	private async performPeriodicHealthChecks(): Promise<void> {
		const services = ['lightning', 'pricing', 'webhook'];

		await Promise.allSettled(services.map((service) => this.checkServiceHealth(service)));
	}

	/**
	 * Check Lightning service health
	 */
	private async checkLightningHealth(): Promise<Record<string, any>> {
		// TODO: Implement actual Lightning service health check
		// This could include checking Atomiq connectivity, invoice generation, etc.
		return {
			timestamp: Date.now(),
			connectivity: 'ok',
			lastInvoice: Date.now() - 60000 // Mock: last invoice 1 minute ago
		};
	}

	/**
	 * Check pricing service health
	 */
	private async checkPricingHealth(): Promise<Record<string, any>> {
		// TODO: Implement actual pricing service health check
		// This could include checking price API connectivity, cache status, etc.
		return {
			timestamp: Date.now(),
			cacheStatus: 'active',
			lastPriceUpdate: Date.now() - 30000 // Mock: last update 30 seconds ago
		};
	}

	/**
	 * Check webhook service health
	 */
	private async checkWebhookHealth(): Promise<Record<string, any>> {
		// TODO: Implement actual webhook service health check
		// This could include checking active connections, webhook processing, etc.
		return {
			timestamp: Date.now(),
			activeConnections: 0, // Mock: no active connections
			lastWebhook: null // Mock: no recent webhooks
		};
	}

	/**
	 * Check Atomiq service health
	 */
	private async checkAtomiqHealth(): Promise<Record<string, any>> {
		// TODO: Implement actual Atomiq service health check
		// This could include checking SDK connectivity, swap status, etc.
		return {
			timestamp: Date.now(),
			sdkConnectivity: 'ok',
			lastSwap: Date.now() - 300000 // Mock: last swap 5 minutes ago
		};
	}
}
