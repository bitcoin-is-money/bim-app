/**
 * @fileoverview Background Jobs Service
 *
 * This service manages periodic background tasks for the application,
 * including blockchain scanning for user transactions.
 *
 * Key Features:
 * - Scheduled blockchain scanning at configurable intervals
 * - Error handling and retry logic
 * - Job status monitoring
 * - Graceful shutdown handling
 *
 * @author bim
 * @version 1.0.0
 */

import { getBlockchainScannerService } from './blockchain-scanner.service';
import { logger } from '$lib/utils/logger';

/**
 * Job configuration interface
 */
interface JobConfig {
	name: string;
	interval: number; // in milliseconds
	enabled: boolean;
	retryCount: number;
	retryDelay: number; // in milliseconds
}

/**
 * Job status interface
 */
interface JobStatus {
	name: string;
	lastRun: Date | null;
	lastSuccess: Date | null;
	lastError: string | null;
	isRunning: boolean;
	runCount: number;
	errorCount: number;
}

/**
 * Background Jobs Service
 */
export class BackgroundJobsService {
	private static instance: BackgroundJobsService;
	private intervals: Map<string, NodeJS.Timeout> = new Map();
	private jobStatuses: Map<string, JobStatus> = new Map();
	private isShuttingDown = false;

	// Job configurations
	private readonly jobs: Record<string, JobConfig> = {
		blockchainScanner: {
			name: 'blockchainScanner',
			interval: 5 * 60 * 1000, // 5 minutes
			enabled: true,
			retryCount: 3,
			retryDelay: 30 * 1000 // 30 seconds
		}
	};

	private constructor() {
		// Initialize job statuses
		Object.values(this.jobs).forEach((job) => {
			this.jobStatuses.set(job.name, {
				name: job.name,
				lastRun: null,
				lastSuccess: null,
				lastError: null,
				isRunning: false,
				runCount: 0,
				errorCount: 0
			});
		});
	}

	static getInstance(): BackgroundJobsService {
		if (!BackgroundJobsService.instance) {
			BackgroundJobsService.instance = new BackgroundJobsService();
		}
		return BackgroundJobsService.instance;
	}

	/**
	 * Start all background jobs
	 */
	startJobs(): void {
		if (this.isShuttingDown) {
			logger.warn('Cannot start jobs: service is shutting down');
			return;
		}

		logger.info('Starting background jobs');

		Object.values(this.jobs).forEach((job) => {
			if (job.enabled) {
				this.startJob(job);
			}
		});

		// Handle graceful shutdown
		process.on('SIGTERM', () => this.shutdown());
		process.on('SIGINT', () => this.shutdown());
	}

	/**
	 * Start a specific job
	 */
	private startJob(config: JobConfig): void {
		if (this.intervals.has(config.name)) {
			logger.warn(`Job ${config.name} is already running`);
			return;
		}

		logger.info(`Starting job: ${config.name} (interval: ${config.interval}ms)`);

		// Run immediately on start
		this.executeJob(config);

		// Schedule periodic execution
		const interval = setInterval(() => {
			if (!this.isShuttingDown) {
				this.executeJob(config);
			}
		}, config.interval);

		this.intervals.set(config.name, interval);
	}

	/**
	 * Execute a job with error handling and retry logic
	 */
	private async executeJob(config: JobConfig): Promise<void> {
		const status = this.jobStatuses.get(config.name);
		if (!status) return;

		if (status.isRunning) {
			logger.warn(`Job ${config.name} is already running, skipping execution`);
			return;
		}

		status.isRunning = true;
		status.lastRun = new Date();
		status.runCount++;

		logger.debug(`Executing job: ${config.name}`);

		let attempt = 0;
		let lastError: Error | null = null;

		while (attempt <= config.retryCount) {
			try {
				await this.runJobHandler(config.name);
				status.lastSuccess = new Date();
				status.lastError = null;
				status.isRunning = false;
				logger.debug(`Job ${config.name} completed successfully`);
				return;
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));
				attempt++;

				if (attempt <= config.retryCount) {
					logger.warn(
						`Job ${config.name} failed (attempt ${attempt}/${config.retryCount + 1}): ${lastError.message}`
					);
					await this.sleep(config.retryDelay);
				}
			}
		}

		// All retry attempts failed
		status.lastError = lastError?.message || 'Unknown error';
		status.errorCount++;
		status.isRunning = false;
		logger.error(
			`Job ${config.name} failed after ${config.retryCount + 1} attempts: ${status.lastError}`
		);
	}

	/**
	 * Execute the actual job logic
	 */
	private async runJobHandler(jobName: string): Promise<void> {
		switch (jobName) {
			case 'blockchainScanner':
				await getBlockchainScannerService().startScanning();
				break;
			default:
				throw new Error(`Unknown job: ${jobName}`);
		}
	}

	/**
	 * Stop a specific job
	 */
	stopJob(jobName: string): void {
		const interval = this.intervals.get(jobName);
		if (interval) {
			clearInterval(interval);
			this.intervals.delete(jobName);
			logger.info(`Stopped job: ${jobName}`);
		}
	}

	/**
	 * Stop all background jobs
	 */
	stopJobs(): void {
		logger.info('Stopping all background jobs');

		this.intervals.forEach((interval, jobName) => {
			clearInterval(interval);
			logger.info(`Stopped job: ${jobName}`);
		});

		this.intervals.clear();
	}

	/**
	 * Get status of all jobs
	 */
	getJobStatuses(): JobStatus[] {
		return Array.from(this.jobStatuses.values());
	}

	/**
	 * Get status of a specific job
	 */
	getJobStatus(jobName: string): JobStatus | undefined {
		return this.jobStatuses.get(jobName);
	}

	/**
	 * Update job configuration
	 */
	updateJobConfig(jobName: string, updates: Partial<JobConfig>): boolean {
		const config = this.jobs[jobName];
		if (!config) return false;

		Object.assign(config, updates);

		// Restart job if it's running and configuration changed
		if (this.intervals.has(jobName)) {
			this.stopJob(jobName);
			if (config.enabled) {
				this.startJob(config);
			}
		}

		return true;
	}

	/**
	 * Graceful shutdown
	 */
	private shutdown(): void {
		if (this.isShuttingDown) return;

		this.isShuttingDown = true;
		logger.info('Shutting down background jobs service');

		this.stopJobs();

		// Wait for running jobs to complete (with timeout)
		const runningJobs = Array.from(this.jobStatuses.values()).filter((status) => status.isRunning);

		if (runningJobs.length > 0) {
			logger.info(`Waiting for ${runningJobs.length} running jobs to complete`);

			const timeout = setTimeout(() => {
				logger.warn('Timeout reached, forcing shutdown');
				process.exit(0);
			}, 30000); // 30 second timeout

			const checkInterval = setInterval(() => {
				const stillRunning = Array.from(this.jobStatuses.values()).filter(
					(status) => status.isRunning
				);
				if (stillRunning.length === 0) {
					clearTimeout(timeout);
					clearInterval(checkInterval);
					logger.info('All jobs completed, shutting down');
					process.exit(0);
				}
			}, 1000);
		} else {
			process.exit(0);
		}
	}

	/**
	 * Sleep utility function
	 */
	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	/**
	 * Check if service is shutting down
	 */
	isShutdownInProgress(): boolean {
		return this.isShuttingDown;
	}
}

// Export singleton instance
export const backgroundJobsService = BackgroundJobsService.getInstance();
