/**
 * @fileoverview Circuit Breaker Manager
 *
 * Manager for handling multiple circuit breakers with different configurations.
 */

import { CircuitBreaker } from './circuit-breaker';
import { CircuitBreakerConfig, CircuitBreakerStats } from './types';

/**
 * Circuit breaker manager for handling multiple circuit breakers
 */
export class CircuitBreakerManager {
	private circuitBreakers = new Map<string, CircuitBreaker>();

	/**
	 * Get or create circuit breaker
	 */
	public getCircuitBreaker(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
		if (!this.circuitBreakers.has(name)) {
			this.circuitBreakers.set(name, new CircuitBreaker({ name, ...config }));
		}
		return this.circuitBreakers.get(name)!;
	}

	/**
	 * Create circuit breaker with specific configuration
	 */
	public createCircuitBreaker(name: string, config: Partial<CircuitBreakerConfig>): CircuitBreaker {
		const circuitBreaker = new CircuitBreaker({ name, ...config });
		this.circuitBreakers.set(name, circuitBreaker);
		return circuitBreaker;
	}

	/**
	 * Execute operation with circuit breaker protection
	 */
	public async execute<T>(
		name: string,
		operation: () => Promise<T>,
		config?: Partial<CircuitBreakerConfig>
	): Promise<T> {
		const circuitBreaker = this.getCircuitBreaker(name, config);
		return circuitBreaker.execute(operation);
	}

	/**
	 * Remove circuit breaker
	 */
	public removeCircuitBreaker(name: string): boolean {
		return this.circuitBreakers.delete(name);
	}

	/**
	 * Check if circuit breaker exists
	 */
	public hasCircuitBreaker(name: string): boolean {
		return this.circuitBreakers.has(name);
	}

	/**
	 * Get all circuit breaker names
	 */
	public getCircuitBreakerNames(): string[] {
		return Array.from(this.circuitBreakers.keys());
	}

	/**
	 * Get all circuit breaker statistics
	 */
	public getAllStats(): Record<string, CircuitBreakerStats> {
		const stats: Record<string, CircuitBreakerStats> = {};
		for (const [name, circuitBreaker] of this.circuitBreakers) {
			stats[name] = circuitBreaker.getStats();
		}
		return stats;
	}

	/**
	 * Get statistics for specific circuit breaker
	 */
	public getStats(name: string): CircuitBreakerStats | null {
		const circuitBreaker = this.circuitBreakers.get(name);
		return circuitBreaker ? circuitBreaker.getStats() : null;
	}

	/**
	 * Reset all circuit breakers
	 */
	public resetAll(): void {
		for (const circuitBreaker of this.circuitBreakers.values()) {
			circuitBreaker.close();
		}
	}

	/**
	 * Reset specific circuit breaker
	 */
	public reset(name: string): boolean {
		const circuitBreaker = this.circuitBreakers.get(name);
		if (circuitBreaker) {
			circuitBreaker.close();
			return true;
		}
		return false;
	}

	/**
	 * Open all circuit breakers
	 */
	public openAll(): void {
		for (const circuitBreaker of this.circuitBreakers.values()) {
			circuitBreaker.open();
		}
	}

	/**
	 * Open specific circuit breaker
	 */
	public open(name: string): boolean {
		const circuitBreaker = this.circuitBreakers.get(name);
		if (circuitBreaker) {
			circuitBreaker.open();
			return true;
		}
		return false;
	}

	/**
	 * Close all circuit breakers
	 */
	public closeAll(): void {
		for (const circuitBreaker of this.circuitBreakers.values()) {
			circuitBreaker.close();
		}
	}

	/**
	 * Close specific circuit breaker
	 */
	public close(name: string): boolean {
		const circuitBreaker = this.circuitBreakers.get(name);
		if (circuitBreaker) {
			circuitBreaker.close();
			return true;
		}
		return false;
	}

	/**
	 * Get circuit breaker count
	 */
	public getCount(): number {
		return this.circuitBreakers.size;
	}

	/**
	 * Clear all circuit breakers
	 */
	public clear(): void {
		this.circuitBreakers.clear();
	}

	/**
	 * Get health summary
	 */
	public getHealthSummary(): {
		total: number;
		open: number;
		halfOpen: number;
		closed: number;
		healthyPercentage: number;
	} {
		let open = 0;
		let halfOpen = 0;
		let closed = 0;

		for (const circuitBreaker of this.circuitBreakers.values()) {
			const stats = circuitBreaker.getStats();
			switch (stats.state) {
				case 'OPEN':
					open++;
					break;
				case 'HALF_OPEN':
					halfOpen++;
					break;
				case 'CLOSED':
					closed++;
					break;
			}
		}

		const total = this.circuitBreakers.size;
		const healthyPercentage = total > 0 ? (closed / total) * 100 : 100;

		return {
			total,
			open,
			halfOpen,
			closed,
			healthyPercentage
		};
	}
}
