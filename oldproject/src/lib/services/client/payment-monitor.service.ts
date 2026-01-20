import type { SwapStatus } from '$lib/services/client/lightning.client.service';
import type {
	MonitoringState,
	PaymentMonitorConfig,
	PaymentStatus,
	StatusChangeEvent
} from '$lib/types/payment-monitor.types';
import { PageVisibilityManager } from '$lib/utils/page-visibility';
import { NetworkRequestService } from './network-request.service';
import { PollingService } from './polling.service';

export class PaymentMonitorService {
	private pollingService: PollingService;
	private networkService: NetworkRequestService;
	private pageVisibilityManager: PageVisibilityManager;
	private state: MonitoringState;
	private config: PaymentMonitorConfig;

	constructor(config: PaymentMonitorConfig) {
		this.config = config;
		this.pollingService = new PollingService({
			debugPolling: config.debugPolling
		});
		this.networkService = new NetworkRequestService();
		this.pageVisibilityManager = new PageVisibilityManager();

		this.state = {
			pollInterval: null,
			lastStatus: null,
			isMonitoring: false
		};

		this.setupPageVisibilityHandling();
	}

	private setupPageVisibilityHandling() {
		this.pageVisibilityManager.addCallback({
			onVisibilityChange: (isVisible) => {
				this.pollingService.updatePageVisibility(isVisible);

				if (!this.state.isMonitoring) return;

				if (isVisible) {
					console.log('📱 Tab became visible - triggering immediate poll');
					this.performPoll();
				}
			}
		});
	}

	public async startMonitoring(): Promise<void> {
		if (this.state.isMonitoring) {
			console.warn('Monitoring already active');
			return;
		}

		this.state.isMonitoring = true;
		this.config.callbacks.onMonitoringChange(true);

		if (this.pollingService.isDebugEnabled()) {
			console.log('🔄 Setting up polling interval...', {
				swapId: this.config.swapId,
				paymentMethod: this.config.paymentMethod,
				timestamp: new Date().toISOString()
			});
		}

		await this.performInitialPoll();
	}

	private async performInitialPoll(): Promise<void> {
		let firstPollCompleted = false;

		this.setupFailsafeTimeouts(() => firstPollCompleted);

		try {
			const shouldContinue = await this.performPoll();
			firstPollCompleted = true;

			if (shouldContinue && this.state.isMonitoring) {
				this.scheduleNextPoll();
			}
		} catch (error) {
			firstPollCompleted = true;
			console.error('🚀 First poll failed:', {
				error: error instanceof Error ? error.message : String(error),
				timestamp: new Date().toISOString()
			});

			if (this.state.isMonitoring) {
				this.scheduleNextPoll();
			}
		}
	}

	private setupFailsafeTimeouts(firstPollCompletedRef: () => boolean) {
		setTimeout(() => {
			if (!firstPollCompletedRef() && this.state.isMonitoring) {
				console.warn(
					'⚠️ EARLY FAILSAFE: First poll taking longer than 5 seconds - starting backup polling'
				);
				this.scheduleNextPoll();
			}
		}, 5000);

		setTimeout(() => {
			if (!firstPollCompletedRef() && this.state.isMonitoring) {
				console.error('🚨 MAIN FAILSAFE: First poll has not completed after 10 seconds');
				this.networkService.performConnectivityCheck();
			}
		}, 10000);
	}

	private async performPoll(): Promise<boolean> {
		if (!this.state.isMonitoring) return false;

		const pollingState = this.pollingService.getState();

		if (this.pollingService.isDebugEnabled()) {
			console.log('🔍 pollFunction START:', {
				pollAttempt: pollingState.pollAttempt + 1,
				consecutiveErrors: pollingState.consecutiveErrors,
				timestamp: new Date().toISOString()
			});
		}

		try {
			this.pollingService.incrementAttempt();
			const updatedState = this.pollingService.getState();

			const endpoint =
				this.config.paymentMethod === 'lightning'
					? `/api/lightning/swap-status/${this.config.swapId}`
					: `/api/bitcoin/swap-status/${this.config.swapId}`;

			if (this.pollingService.shouldLog()) {
				console.log(`🔍 Poll #${updatedState.pollAttempt}:`, {
					endpoint,
					timestamp: new Date().toISOString()
				});
			}

			const response = await this.networkService.makeRequest({
				endpoint,
				timeoutDuration: this.pollingService.getTimeoutDuration(),
				debugEnabled: this.pollingService.isDebugEnabled(),
				attempt: updatedState.pollAttempt
			});

			if (!response.ok) {
				this.pollingService.incrementErrors();

				// Handle rate limiting (429) with exponential backoff
				if (response.status === 429) {
					const backoffDelay = Math.min(4000 * Math.pow(2, updatedState.consecutiveErrors), 30000); // Max 30s
					console.warn('🚨 Rate limited (429) - backing off:', {
						status: response.status,
						endpoint,
						attempt: updatedState.pollAttempt,
						backoffDelay,
						consecutiveErrors: updatedState.consecutiveErrors,
						timestamp: new Date().toISOString()
					});

					// Schedule next poll with exponential backoff
					setTimeout(() => {
						if (this.state.isMonitoring) {
							this.scheduleNextPoll();
						}
					}, backoffDelay);

					return false; // Don't continue normal polling
				}

				console.error('🚨 Bad response:', {
					status: response.status,
					endpoint,
					attempt: updatedState.pollAttempt,
					timestamp: new Date().toISOString()
				});
				return true;
			}

			return this.handleSuccessfulResponse(response.data, updatedState.pollAttempt);
		} catch (error) {
			this.pollingService.incrementErrors();
			const pollingState = this.pollingService.getState();

			console.error('🔍 Polling Error:', {
				swapId: this.config.swapId,
				attempt: pollingState.pollAttempt,
				consecutiveErrors: pollingState.consecutiveErrors,
				error: error instanceof Error ? error.message : String(error),
				timestamp: new Date().toISOString()
			});

			if (pollingState.consecutiveErrors >= 3) {
				console.log('🔍 Multiple consecutive errors - performing connectivity check...');
				this.networkService.performConnectivityCheck();
			}

			return true; // Continue polling on errors
		}
	}

	private handleSuccessfulResponse(newStatus: SwapStatus, attempt: number): boolean {
		this.pollingService.resetErrors();

		if (
			this.pollingService.shouldLog() ||
			!this.state.lastStatus ||
			this.state.lastStatus.status !== newStatus?.status
		) {
			console.log('Poll Response:', { attempt, status: newStatus?.status });
		}

		if (!this.state.lastStatus || this.state.lastStatus.status !== newStatus.status) {
			this.logStatusChange(newStatus, attempt);
		}

		this.state.lastStatus = newStatus;
		this.config.callbacks.onStatusUpdate(newStatus);

		return this.handleTerminalStates(newStatus);
	}

	private logStatusChange(newStatus: SwapStatus, attempt: number) {
		const event: StatusChangeEvent = {
			swapId: this.config.swapId,
			previousStatus: this.state.lastStatus?.status || 'none',
			newStatus: newStatus.status,
			progress: newStatus.progress,
			attempt,
			timestamp: new Date().toISOString()
		};

		console.log('Status Update:', event);
	}

	private handleTerminalStates(status: SwapStatus): boolean {
		if (status.status === 'completed') {
			console.log('🏁 POLLING TERMINATED - Payment completed:', {
				swapId: this.config.swapId,
				finalStatus: status.status,
				txHash: status.txHash,
				timestamp: new Date().toISOString()
			});

			this.stopMonitoring();
			this.config.callbacks.onComplete(status);
			return false;
		}

		if (status.status === 'failed') {
			console.log('💥 POLLING TERMINATED - Payment failed:', {
				swapId: this.config.swapId,
				finalStatus: status.status,
				errorMessage: status.errorMessage,
				timestamp: new Date().toISOString()
			});

			this.stopMonitoring();
			const errorMsg = status.errorMessage || 'Payment failed';
			this.config.callbacks.onError(errorMsg);
			return false;
		}

		if (status.status === 'expired') {
			// For Bitcoin swaps, implement retry logic with exponential backoff
			// before giving up on expired status
			if (this.config.paymentMethod === 'bitcoin') {
				const currentAttempt = this.pollingService.getState().pollAttempt;
				const maxRetryAttempts = 5; // Try 5 more times before giving up

				if (currentAttempt <= maxRetryAttempts) {
					console.warn('⏰ Bitcoin swap expired but retrying with exponential backoff:', {
						swapId: this.config.swapId,
						attempt: currentAttempt,
						maxAttempts: maxRetryAttempts,
						reason: 'Bitcoin swaps may recover from temporary expiration',
						timestamp: new Date().toISOString()
					});

					// Use exponential backoff for Bitcoin swap retry attempts
					const retryDelay = Math.min(5000 * Math.pow(2, currentAttempt - 1), 60000); // Max 1 minute

					setTimeout(() => {
						if (this.state.isMonitoring) {
							this.performPoll().then((shouldContinue) => {
								if (shouldContinue && this.state.isMonitoring) {
									this.scheduleNextPoll();
								}
							});
						}
					}, retryDelay);

					return false; // Don't schedule normal polling, we're handling retry manually
				}
			}

			console.log('💥 POLLING TERMINATED - Payment expired:', {
				swapId: this.config.swapId,
				finalStatus: status.status,
				errorMessage: status.errorMessage,
				paymentMethod: this.config.paymentMethod,
				timestamp: new Date().toISOString()
			});

			this.stopMonitoring();
			const errorMsg = status.errorMessage || 'Payment expired';
			this.config.callbacks.onError(errorMsg);
			return false;
		}

		if (!this.isActiveStatus(status.status as PaymentStatus)) {
			console.log('🔍 Terminal status:', {
				status: status.status,
				attempt: this.pollingService.getState().pollAttempt
			});
		}

		return true; // Continue polling
	}

	private isActiveStatus(status: PaymentStatus): boolean {
		return ['pending', 'waiting_payment', 'paid', 'confirming'].includes(status);
	}

	private scheduleNextPoll() {
		if (this.state.pollInterval) {
			clearTimeout(this.state.pollInterval);
		}

		const nextInterval = this.pollingService.calculateNextInterval();

		this.state.pollInterval = setTimeout(async () => {
			if (!this.state.isMonitoring) return;

			try {
				const shouldContinue = await this.performPoll();
				if (shouldContinue && this.state.isMonitoring) {
					this.scheduleNextPoll();
				}
			} catch (error) {
				console.error('⏰ Error in scheduled poll:', {
					error: error instanceof Error ? error.message : String(error)
				});

				if (this.state.isMonitoring) {
					this.scheduleNextPoll();
				}
			}
		}, nextInterval);
	}

	public stopMonitoring(): void {
		console.log('Monitoring Stopped:', {
			swapId: this.config.swapId,
			totalAttempts: this.pollingService.getState().pollAttempt,
			timestamp: new Date().toISOString()
		});

		this.state.isMonitoring = false;

		if (this.state.pollInterval) {
			clearTimeout(this.state.pollInterval);
			this.state.pollInterval = null;
		}

		this.config.callbacks.onMonitoringChange(false);
	}

	public destroy(): void {
		this.stopMonitoring();
		this.pageVisibilityManager.destroy();
	}
}
