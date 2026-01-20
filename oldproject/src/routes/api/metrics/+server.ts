import { text } from '@sveltejs/kit';
import { db } from '$lib/db';
import { logger, createRequestContext } from '$lib/utils/logger';
import type { RequestHandler } from './$types';

interface Metric {
	name: string;
	value: number;
	timestamp: number;
	labels?: Record<string, string>;
}

class MetricsCollector {
	private metrics: Map<string, Metric> = new Map();
	private startTime = Date.now();

	// System metrics
	async collectSystemMetrics(): Promise<Metric[]> {
		const systemMetrics: Metric[] = [];
		const now = Date.now();

		// Memory usage
		const memory = process.memoryUsage();
		systemMetrics.push({
			name: 'nodejs_heap_used_bytes',
			value: memory.heapUsed,
			timestamp: now,
			labels: { type: 'heap' }
		});

		systemMetrics.push({
			name: 'nodejs_heap_total_bytes',
			value: memory.heapTotal,
			timestamp: now,
			labels: { type: 'heap' }
		});

		systemMetrics.push({
			name: 'nodejs_external_memory_bytes',
			value: memory.external,
			timestamp: now,
			labels: { type: 'external' }
		});

		// Process uptime
		systemMetrics.push({
			name: 'nodejs_process_uptime_seconds',
			value: process.uptime(),
			timestamp: now
		});

		// Event loop lag (approximation)
		const start = process.hrtime.bigint();
		await new Promise((resolve) => setImmediate(resolve));
		const lag = Number(process.hrtime.bigint() - start) / 1e6; // Convert to milliseconds

		systemMetrics.push({
			name: 'nodejs_eventloop_lag_milliseconds',
			value: lag,
			timestamp: now
		});

		return systemMetrics;
	}

	// Database metrics
	async collectDatabaseMetrics(): Promise<Metric[]> {
		const metrics: Metric[] = [];
		const now = Date.now();

		try {
			const database = db();
			if (!database) {
				metrics.push({
					name: 'database_connected',
					value: 0,
					timestamp: now,
					labels: { status: 'not_configured' }
				});
				return metrics;
			}

			// Connection status
			const start = Date.now();
			await database.execute('SELECT 1');
			const responseTime = Date.now() - start;

			metrics.push({
				name: 'database_connected',
				value: 1,
				timestamp: now,
				labels: { status: 'connected' }
			});

			metrics.push({
				name: 'database_query_duration_milliseconds',
				value: responseTime,
				timestamp: now,
				labels: { query: 'health_check' }
			});

			// Table counts
			try {
				const userCount = await database.execute('SELECT COUNT(*) as count FROM users');
				metrics.push({
					name: 'database_table_rows',
					value: Number(userCount[0]?.count || 0),
					timestamp: now,
					labels: { table: 'users' }
				});

				const sessionCount = await database.execute('SELECT COUNT(*) as count FROM sessions');
				metrics.push({
					name: 'database_table_rows',
					value: Number(sessionCount[0]?.count || 0),
					timestamp: now,
					labels: { table: 'sessions' }
				});
			} catch (error) {
				// Tables might not exist yet, that's ok
				metrics.push({
					name: 'database_table_rows',
					value: 0,
					timestamp: now,
					labels: { table: 'users', status: 'table_not_found' }
				});
			}
		} catch (error) {
			metrics.push({
				name: 'database_connected',
				value: 0,
				timestamp: now,
				labels: { status: 'error', error: 'connection_failed' }
			});
		}

		return metrics;
	}

	// Application metrics
	async collectApplicationMetrics(): Promise<Metric[]> {
		const metrics: Metric[] = [];
		const now = Date.now();

		// Application uptime since start
		metrics.push({
			name: 'application_uptime_seconds',
			value: (now - this.startTime) / 1000,
			timestamp: now
		});

		// Environment info
		metrics.push({
			name: 'application_info',
			value: 1,
			timestamp: now,
			labels: {
				version: '1.0.0',
				node_version: process.version
			}
		});

		// Configuration status
		const requiredEnvVars: string[] = [];
		const optionalEnvVars = ['DATABASE_URL', 'SESSION_SECRET', 'STARKNET_RPC_URL', 'SENTRY_DSN'];

		const requiredConfigured = requiredEnvVars.filter((env) => process.env[env]).length;
		const optionalConfigured = optionalEnvVars.filter((env) => process.env[env]).length;

		metrics.push({
			name: 'application_config_required',
			value: requiredConfigured,
			timestamp: now,
			labels: { total: requiredEnvVars.length.toString() }
		});

		metrics.push({
			name: 'application_config_optional',
			value: optionalConfigured,
			timestamp: now,
			labels: { total: optionalEnvVars.length.toString() }
		});

		return metrics;
	}

	// Format metrics in Prometheus format
	formatPrometheus(metrics: Metric[]): string {
		const grouped = new Map<string, Metric[]>();

		// Group metrics by name
		for (const metric of metrics) {
			if (!grouped.has(metric.name)) {
				grouped.set(metric.name, []);
			}
			grouped.get(metric.name)!.push(metric);
		}

		let output = '';

		for (const [name, metricList] of grouped) {
			// Add help comment
			output += `# HELP ${name} Application metric\n`;
			output += `# TYPE ${name} gauge\n`;

			for (const metric of metricList) {
				let line = name;

				// Add labels if present
				if (metric.labels && Object.keys(metric.labels).length > 0) {
					const labelPairs = Object.entries(metric.labels)
						.map(([key, value]) => `${key}="${value}"`)
						.join(',');
					line += `{${labelPairs}}`;
				}

				line += ` ${metric.value} ${metric.timestamp}\n`;
				output += line;
			}

			output += '\n';
		}

		return output;
	}

	async collectAllMetrics(): Promise<Metric[]> {
		const [systemMetrics, dbMetrics, appMetrics] = await Promise.all([
			this.collectSystemMetrics(),
			this.collectDatabaseMetrics(),
			this.collectApplicationMetrics()
		]);

		return [...systemMetrics, ...dbMetrics, ...appMetrics];
	}
}

const metricsCollector = new MetricsCollector();

export const GET: RequestHandler = async ({ request, locals, url, getClientAddress }) => {
	const context = createRequestContext({
		request,
		locals,
		url,
		getClientAddress
	});
	const startTime = Date.now();

	try {
		logger.debug('Metrics collection requested', context);

		// Collect all metrics
		const metrics = await metricsCollector.collectAllMetrics();

		// Format based on Accept header
		const acceptHeader = request.headers.get('accept') || '';
		const duration = Date.now() - startTime;

		if (acceptHeader.includes('application/json')) {
			// JSON format
			logger.debug('Metrics collected (JSON format)', {
				...context,
				duration,
				metricsCount: metrics.length
			});

			return new Response(
				JSON.stringify({
					timestamp: new Date().toISOString(),
					metrics,
					summary: {
						total: metrics.length,
						collectionTime: duration
					}
				}),
				{
					headers: {
						'Content-Type': 'application/json',
						'Cache-Control': 'no-cache'
					}
				}
			);
		} else {
			// Prometheus format (default)
			const prometheusOutput = metricsCollector.formatPrometheus(metrics);

			logger.debug('Metrics collected (Prometheus format)', {
				...context,
				duration,
				metricsCount: metrics.length
			});

			return text(prometheusOutput, {
				headers: {
					'Content-Type': 'text/plain; version=0.0.4',
					'Cache-Control': 'no-cache'
				}
			});
		}
	} catch (error) {
		const duration = Date.now() - startTime;
		logger.error('Metrics collection failed', error as Error, {
			...context,
			duration
		});

		return new Response('# Metrics collection failed\n', {
			status: 500,
			headers: {
				'Content-Type': 'text/plain',
				'Cache-Control': 'no-cache'
			}
		});
	}
};
