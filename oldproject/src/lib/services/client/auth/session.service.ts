/**
 * @fileoverview Session Management Service
 *
 * Handles session management, caching, and user state persistence.
 */

import { currentUser } from '$lib/stores/auth';
import type { UserWithCredentials } from './types';

/**
 * Cache entry structure
 */
interface CacheEntry<T> {
	data: T;
	timestamp: number;
}

/**
 * Session management service
 */
export class SessionService {
	private cache = new Map<string, CacheEntry<any>>();
	private defaultTtl = 30000; // 30 seconds

	/**
	 * Get cached data with TTL check
	 */
	get<T>(key: string, ttl: number = this.defaultTtl): T | null {
		const entry = this.cache.get(key);
		if (!entry) return null;

		if (Date.now() - entry.timestamp > ttl) {
			this.cache.delete(key);
			return null;
		}

		return entry.data;
	}

	/**
	 * Set cached data with timestamp
	 */
	set<T>(key: string, data: T): void {
		this.cache.set(key, {
			data,
			timestamp: Date.now()
		});
	}

	/**
	 * Remove cached data
	 */
	delete(key: string): boolean {
		return this.cache.delete(key);
	}

	/**
	 * Clear all cached data
	 */
	clear(): void {
		this.cache.clear();
	}

	/**
	 * Update user in cache and reactive store
	 */
	updateCurrentUser(user: UserWithCredentials | null): void {
		if (user) {
			this.set('currentUser', user);
		} else {
			this.delete('currentUser');
		}
		currentUser.set(user);
	}

	/**
	 * Get cached current user
	 */
	getCachedCurrentUser(): UserWithCredentials | null {
		return this.get<UserWithCredentials>('currentUser');
	}

	/**
	 * Clear current user session
	 */
	clearCurrentUser(): void {
		this.delete('currentUser');
		currentUser.set(null);
	}

	/**
	 * Check if user session is cached and valid
	 */
	hasValidSession(): boolean {
		return this.getCachedCurrentUser() !== null;
	}
}
