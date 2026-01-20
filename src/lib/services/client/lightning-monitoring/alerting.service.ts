/**
 * @fileoverview Lightning Alerting Service
 *
 * Focused service for managing alerts and notifications based on Lightning metrics.
 * Handles alert configuration, threshold checking, and notification delivery.
 *
 * Key Features:
 * - Configurable alert thresholds and conditions
 * - Real-time metric evaluation against alert rules
 * - Alert severity management
 * - Active alert tracking and deduplication
 * - Notification delivery (logging, webhooks, etc.)
 *
 * @author bim
 * @version 1.0.0
 */

import { ErrorSeverity } from '$lib/errors/lightning';
import { logger } from '$lib/utils/logger';
import { monitoring } from '$lib/utils/monitoring';
import type { MetricData } from './metrics-collector.service';
import { MetricType } from './metrics-collector.service';

/**
 * Alert configuration
 */
export interface AlertConfig {
	id: string;
	name: string;
	metric: MetricType;
	threshold: number;
	window: number; // Time window in milliseconds
	comparison: 'greater_than' | 'less_than' | 'equal_to';
	enabled: boolean;
	severity: ErrorSeverity;
	recipients?: string[];
	description?: string;
	cooldownMs?: number; // Minimum time between alerts
}

/**
 * Active alert instance
 */
export interface ActiveAlert {
	id: string;
	configId: string;
	severity: ErrorSeverity;
	message: string;
	timestamp: number;
	value: number;
	threshold: number;
	metric: MetricType;
	metadata?: Record<string, any>;
}

/**
 * Alert evaluation result
 */
interface AlertEvaluation {
	triggered: boolean;
	value: number;
	threshold: number;
	message: string;
}

/**
 * Lightning Alerting Service
 */
export class AlertingService {
	private alerts: AlertConfig[] = [];
	private activeAlerts: Map<string, ActiveAlert> = new Map();
	private lastAlertTime: Map<string, number> = new Map();

	constructor() {
		this.initializeDefaultAlerts();
	}

	/**
	 * Add or update an alert configuration
	 */
	addAlert(config: AlertConfig): void {
		const existingIndex = this.alerts.findIndex((a) => a.id === config.id);

		if (existingIndex >= 0) {
			this.alerts[existingIndex] = config;
			logger.info('Alert configuration updated', {
				id: config.id,
				name: config.name
			});
		} else {
			this.alerts.push(config);
			logger.info('Alert configuration added', {
				id: config.id,
				name: config.name
			});
		}
	}

	/**
	 * Remove an alert configuration
	 */
	removeAlert(alertId: string): boolean {
		const index = this.alerts.findIndex((a) => a.id === alertId);

		if (index >= 0) {
			const removed = this.alerts.splice(index, 1)[0];
			this.activeAlerts.delete(alertId);
			this.lastAlertTime.delete(alertId);

			if (removed) {
				logger.info('Alert configuration removed', {
					id: alertId,
					name: removed.name
				});
			}
			return true;
		}

		return false;
	}

	/**
	 * Get all alert configurations
	 */
	getAlerts(): AlertConfig[] {
		return [...this.alerts];
	}

	/**
	 * Get active alerts
	 */
	getActiveAlerts(): ActiveAlert[] {
		return Array.from(this.activeAlerts.values());
	}

	/**
	 * Enable or disable an alert
	 */
	setAlertEnabled(alertId: string, enabled: boolean): boolean {
		const alert = this.alerts.find((a) => a.id === alertId);

		if (alert) {
			alert.enabled = enabled;

			if (!enabled) {
				this.activeAlerts.delete(alertId);
			}

			logger.info('Alert enabled state changed', { id: alertId, enabled });
			return true;
		}

		return false;
	}

	/**
	 * Check metrics against all alert configurations
	 */
	checkAlerts(metrics: MetricData[]): ActiveAlert[] {
		const triggeredAlerts: ActiveAlert[] = [];

		for (const alertConfig of this.alerts) {
			if (!alertConfig.enabled) {
				continue;
			}

			// Check cooldown period
			const lastAlert = this.lastAlertTime.get(alertConfig.id);
			const cooldownMs = alertConfig.cooldownMs || 300000; // Default 5 minutes

			if (lastAlert && Date.now() - lastAlert < cooldownMs) {
				continue;
			}

			const evaluation = this.evaluateAlert(alertConfig, metrics);

			if (evaluation.triggered) {
				const alert = this.createActiveAlert(alertConfig, evaluation);
				triggeredAlerts.push(alert);

				this.activeAlerts.set(alertConfig.id, alert);
				this.lastAlertTime.set(alertConfig.id, Date.now());

				this.deliverAlert(alert);
			} else {
				// Remove from active alerts if condition no longer met
				this.activeAlerts.delete(alertConfig.id);
			}
		}

		return triggeredAlerts;
	}

	/**
	 * Check a single metric against all alert configurations
	 */
	checkMetric(metric: MetricData): ActiveAlert[] {
		return this.checkAlerts([metric]);
	}

	/**
	 * Manually trigger an alert (for testing or external triggers)
	 */
	triggerAlert(
		configId: string,
		message: string,
		value: number,
		metadata?: Record<string, any>
	): ActiveAlert | null {
		const config = this.alerts.find((a) => a.id === configId);

		if (!config) {
			logger.warn('Cannot trigger alert: configuration not found', {
				configId
			});
			return null;
		}

		const alert: ActiveAlert = {
			id: `${configId}-${Date.now()}`,
			configId,
			severity: config.severity,
			message,
			timestamp: Date.now(),
			value,
			threshold: config.threshold,
			metric: config.metric,
			metadata: metadata || {}
		};

		this.activeAlerts.set(configId, alert);
		this.deliverAlert(alert);

		return alert;
	}

	/**
	 * Clear active alerts
	 */
	clearActiveAlerts(configId?: string): void {
		if (configId) {
			this.activeAlerts.delete(configId);
			logger.info('Active alert cleared', { configId });
		} else {
			this.activeAlerts.clear();
			logger.info('All active alerts cleared');
		}
	}

	/**
	 * Get alert statistics
	 */
	getAlertStatistics(windowMs: number = 86400000): {
		totalAlerts: number;
		alertsBySeverity: Record<ErrorSeverity, number>;
		alertsByMetric: Record<string, number>;
		averageResolutionTime: number;
	} {
		const now = Date.now();
		const windowStart = now - windowMs;

		const recentAlerts = Array.from(this.activeAlerts.values()).filter(
			(alert) => alert.timestamp >= windowStart
		);

		const alertsBySeverity: Record<ErrorSeverity, number> = {
			[ErrorSeverity.LOW]: 0,
			[ErrorSeverity.MEDIUM]: 0,
			[ErrorSeverity.HIGH]: 0,
			[ErrorSeverity.CRITICAL]: 0
		};

		const alertsByMetric: Record<string, number> = {};

		for (const alert of recentAlerts) {
			alertsBySeverity[alert.severity]++;
			alertsByMetric[alert.metric] = (alertsByMetric[alert.metric] || 0) + 1;
		}

		return {
			totalAlerts: recentAlerts.length,
			alertsBySeverity,
			alertsByMetric,
			averageResolutionTime: 0 // TODO: Implement resolution time tracking
		};
	}

	// Private methods

	/**
	 * Initialize default alert configurations
	 */
	private initializeDefaultAlerts(): void {
		const defaultAlerts: AlertConfig[] = [
			{
				id: 'high-error-rate',
				name: 'High Error Rate',
				metric: MetricType.PAYMENT_FAILED,
				threshold: 0.1, // 10% error rate
				window: 300000, // 5 minutes
				comparison: 'greater_than',
				enabled: true,
				severity: ErrorSeverity.HIGH,
				description: 'Payment error rate exceeds 10%',
				cooldownMs: 600000 // 10 minutes
			},
			{
				id: 'payment-timeout-spike',
				name: 'Payment Timeout Spike',
				metric: MetricType.PAYMENT_TIMEOUT,
				threshold: 5,
				window: 300000, // 5 minutes
				comparison: 'greater_than',
				enabled: true,
				severity: ErrorSeverity.MEDIUM,
				description: 'More than 5 payment timeouts in 5 minutes'
			},
			{
				id: 'circuit-breaker-opened',
				name: 'Circuit Breaker Opened',
				metric: MetricType.CIRCUIT_BREAKER_OPENED,
				threshold: 1,
				window: 60000, // 1 minute
				comparison: 'greater_than',
				enabled: true,
				severity: ErrorSeverity.CRITICAL,
				description: 'Circuit breaker opened indicating service degradation'
			}
		];

		for (const alert of defaultAlerts) {
			this.addAlert(alert);
		}

		logger.info('Default alert configurations initialized', {
			count: defaultAlerts.length
		});
	}

	/**
	 * Evaluate an alert configuration against metrics
	 */
	private evaluateAlert(config: AlertConfig, metrics: MetricData[]): AlertEvaluation {
		const windowStart = Date.now() - config.window;
		const relevantMetrics = metrics.filter(
			(m) => m.type === config.metric && m.timestamp >= windowStart
		);

		let value: number;
		let message: string;

		// Calculate aggregate value based on metric type
		if (relevantMetrics.length === 0) {
			value = 0;
			message = `No ${config.metric} metrics in the last ${config.window / 1000}s`;
		} else {
			value = relevantMetrics.reduce((sum, metric) => sum + metric.value, 0);

			// For rate-based metrics, calculate percentage
			if (config.metric.includes('failed') || config.metric.includes('success')) {
				const totalMetrics = metrics.filter((m) => m.timestamp >= windowStart);
				value = totalMetrics.length > 0 ? value / totalMetrics.length : 0;
			}

			message = `${config.metric} value: ${value.toFixed(2)}, threshold: ${config.threshold}`;
		}

		let triggered = false;

		switch (config.comparison) {
			case 'greater_than':
				triggered = value > config.threshold;
				break;
			case 'less_than':
				triggered = value < config.threshold;
				break;
			case 'equal_to':
				triggered = Math.abs(value - config.threshold) < 0.001; // Floating point comparison
				break;
		}

		return {
			triggered,
			value,
			threshold: config.threshold,
			message
		};
	}

	/**
	 * Create an active alert from configuration and evaluation
	 */
	private createActiveAlert(config: AlertConfig, evaluation: AlertEvaluation): ActiveAlert {
		return {
			id: `${config.id}-${Date.now()}`,
			configId: config.id,
			severity: config.severity,
			message: `${config.name}: ${evaluation.message}`,
			timestamp: Date.now(),
			value: evaluation.value,
			threshold: evaluation.threshold,
			metric: config.metric,
			metadata: {
				alertName: config.name,
				description: config.description
			}
		};
	}

	/**
	 * Deliver alert notification
	 */
	private deliverAlert(alert: ActiveAlert): void {
		// Log the alert
		const logLevel = this.getLogLevel(alert.severity);
		const logContext = {
			alertId: alert.id,
			configId: alert.configId,
			severity: alert.severity,
			value: alert.value,
			threshold: alert.threshold,
			metric: alert.metric
		};

		if (logLevel === 'error') {
			const error = new Error(alert.message);
			logger.error('Lightning alert triggered', error, logContext);
		} else {
			logger[logLevel]('Lightning alert triggered', logContext);
		}

		// Send to monitoring system
		const monitoringLevel = this.mapSeverityToMonitoringLevel(alert.severity);
		monitoring.captureMessage(alert.message, {
			level: monitoringLevel,
			tags: {
				alertId: alert.id,
				configId: alert.configId,
				metric: alert.metric
			},
			extra: {
				value: alert.value,
				threshold: alert.threshold,
				metadata: alert.metadata || {}
			}
		});

		// TODO: Implement additional notification channels
		// - Webhook notifications
		// - Email notifications
		// - Slack/Discord notifications
		// - SMS for critical alerts
	}

	/**
	 * Get appropriate log level for alert severity
	 */
	private getLogLevel(severity: ErrorSeverity): 'debug' | 'info' | 'warn' | 'error' {
		switch (severity) {
			case ErrorSeverity.LOW:
				return 'info';
			case ErrorSeverity.MEDIUM:
				return 'warn';
			case ErrorSeverity.HIGH:
			case ErrorSeverity.CRITICAL:
				return 'error';
			default:
				return 'info';
		}
	}

	/**
	 * Map error severity to monitoring system level
	 */
	private mapSeverityToMonitoringLevel(severity: ErrorSeverity): 'error' | 'info' | 'warning' {
		switch (severity) {
			case ErrorSeverity.LOW:
				return 'info';
			case ErrorSeverity.MEDIUM:
				return 'warning';
			case ErrorSeverity.HIGH:
			case ErrorSeverity.CRITICAL:
				return 'error';
			default:
				return 'info';
		}
	}
}
