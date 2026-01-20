/**
 * API and Network Constants
 * Centralized configuration for URLs, endpoints, timeouts, and network settings
 */

/**
 * External API endpoints and service URLs
 * @description Centralized configuration for third-party services
 */
export const API_ENDPOINTS = {
	/** CoinGecko cryptocurrency price API */
	COINgecko_API: 'https://api.coingecko.com/api/v3',
	/** Google Fonts service for loading web fonts */
	GOOGLE_FONTS: 'https://fonts.googleapis.com'
} as const;

/**
 * Timeout configuration for various operations
 * @description All timeouts are specified in milliseconds
 */
export const TIMEOUTS = {
	/** WebAuthn credential creation timeout (2 minutes) */
	WEBAUTHN_CREATE: 120_000,
	/** WebAuthn credential retrieval timeout (5 minutes) - increased for better UX */
	WEBAUTHN_GET: 300_000,
	/** General API request timeout (30 seconds) */
	API_REQUEST: 30_000,
	/** Lightning operations timeout (2 minutes) - increased for complex swap operations */
	LIGHTNING_OPERATION: 120_000,
	/** Standard polling interval (1 second) */
	POLLING_INTERVAL: 1_000,
	/** Long polling interval for less frequent updates (5 seconds) */
	LONG_POLLING: 5_000,
	/** Circuit breaker recovery timeout (1 minute) */
	CIRCUIT_BREAKER_TIMEOUT: 60_000
} as const;

// Network Configuration
export const NETWORK = {
	LOCALHOST_PORT: 5050,
	DEV_SERVER_PORT: 5173
} as const;

// Cache TTL Configuration (in milliseconds)
export const CACHE_TTL = {
	SHORT: 60_000, // 1 minute
	MEDIUM: 300_000, // 5 minutes
	LONG: 600_000, // 10 minutes
	PRICING: 300_000, // 5 minutes for pricing data
	USER_TRANSACTIONS: 30_000 // 30 seconds for user transactions cache
} as const;

// Rate Limiting Configuration
export const RATE_LIMITS = {
	LOGIN_ATTEMPTS: 5,
	REGISTER_ATTEMPTS: 3,
	WINDOW_MS: 900_000, // 15 minutes
	BURST_REQUESTS: 10
} as const;

// Retry Configuration
export const RETRY_CONFIG = {
	MAX_ATTEMPTS: 3,
	BASE_DELAY: 1_000, // 1 second
	MAX_DELAY: 10_000, // 10 seconds
	BACKOFF_MULTIPLIER: 2,
	JITTER: true
} as const;

// Circuit Breaker Configuration
export const CIRCUIT_BREAKER = {
	FAILURE_THRESHOLD: 5,
	RECOVERY_TIMEOUT: 30_000, // 30 seconds
	MONITOR_WINDOW: 60_000 // 1 minute
} as const;
