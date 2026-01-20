export interface PollingConfig {
	baseInterval: number;
	maxInterval: number;
	maxBackoffMultiplier: number;
	timeoutDuration: number;
	earlyTimeoutDuration: number;
	backgroundMultiplier: number;
	debugPolling?: boolean;
}

export interface PollingState {
	pollAttempt: number;
	consecutiveErrors: number;
	isPageVisible: boolean;
}

import { POLLING } from '$lib/constants';

export class PollingService {
	private config: PollingConfig;
	private state: PollingState;

	constructor(config: Partial<PollingConfig> = {}) {
		this.config = { ...POLLING.DEFAULTS, ...config };
		this.state = {
			pollAttempt: 0,
			consecutiveErrors: 0,
			isPageVisible: true
		};
	}

	public calculateNextInterval(): number {
		const baseInterval = this.state.isPageVisible
			? this.config.baseInterval
			: this.config.baseInterval * this.config.backgroundMultiplier;

		const maxInterval = this.state.isPageVisible
			? this.config.maxInterval
			: this.config.maxInterval * this.config.backgroundMultiplier;

		const backoffMultiplier = Math.min(
			this.state.consecutiveErrors,
			this.config.maxBackoffMultiplier
		);
		const interval = Math.min(baseInterval * Math.pow(2, backoffMultiplier), maxInterval);

		if (this.config.debugPolling) {
			console.log('⏰ Calculated next interval:', {
				baseInterval,
				maxInterval,
				consecutiveErrors: this.state.consecutiveErrors,
				backoffMultiplier,
				calculatedInterval: interval,
				isPageVisible: this.state.isPageVisible,
				timestamp: new Date().toISOString()
			});
		}

		return interval;
	}

	public getTimeoutDuration(): number {
		return this.state.pollAttempt <= 3
			? this.config.earlyTimeoutDuration
			: this.config.timeoutDuration;
	}

	public incrementAttempt(): void {
		this.state.pollAttempt++;
	}

	public incrementErrors(): void {
		this.state.consecutiveErrors++;
	}

	public resetErrors(): void {
		this.state.consecutiveErrors = 0;
	}

	public updatePageVisibility(isVisible: boolean): void {
		this.state.isPageVisible = isVisible;
	}

	public getState(): PollingState {
		return { ...this.state };
	}

	public shouldLog(): boolean {
		return this.state.pollAttempt % 10 === 1 || this.state.pollAttempt <= 3;
	}

	public isDebugEnabled(): boolean {
		return this.config.debugPolling || false;
	}
}
