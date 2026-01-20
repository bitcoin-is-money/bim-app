/**
 * Configuration Constants
 * System-wide configuration values for caching, monitoring, and operational settings
 */

// Environment Configuration
export const ENVIRONMENT = {
	DEVELOPMENT: 'development',
	STAGING: 'staging',
	PRODUCTION: 'production'
} as const;

// Logging Configuration
export const LOGGING = {
	LEVELS: {
		ERROR: 'error',
		WARN: 'warn',
		INFO: 'info',
		DEBUG: 'debug'
	},
	MAX_LOG_SIZE: 10_000_000, // 10MB
	MAX_LOG_FILES: 5,
	CONSOLE_LOG_LEVEL: 'debug',
	FILE_LOG_LEVEL: 'info'
} as const;

// Monitoring Configuration
export const MONITORING = {
	METRICS_INTERVAL: 30_000, // 30 seconds
	HEALTH_CHECK_INTERVAL: 10_000, // 10 seconds
	PERFORMANCE_SAMPLE_RATE: 0.1, // 10%
	ERROR_SAMPLE_RATE: 1.0, // 100%
	MAX_BREADCRUMBS: 50,
	// Caps for in-memory metrics buffers
	MAX_METRICS: 10_000,
	MAX_RESPONSE_SAMPLES: 1_000
} as const;

// Session Configuration
export const SESSION = {
	MAX_AGE: 86_400_000, // 24 hours in ms
	REFRESH_THRESHOLD: 3_600_000, // 1 hour in ms
	COOKIE_NAME: 'bim3-session',
	SECURE_COOKIE: true,
	HTTP_ONLY: true
} as const;

// Database Configuration
export const DATABASE = {
	CONNECTION_TIMEOUT: 30_000, // 30 seconds
	QUERY_TIMEOUT: 10_000, // 10 seconds
	MAX_CONNECTIONS: 10,
	IDLE_TIMEOUT: 60_000, // 1 minute
	RETRY_ATTEMPTS: 3
} as const;

// File Upload Configuration
export const UPLOAD = {
	MAX_FILE_SIZE: 5_000_000, // 5MB
	ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
	MAX_FILES: 10,
	UPLOAD_TIMEOUT: 60_000 // 1 minute
} as const;

// Security Configuration
export const SECURITY = {
	BCRYPT_ROUNDS: 12,
	CORS_MAX_AGE: 86_400, // 24 hours
	CSP_REPORT_ONLY: false,
	XSS_PROTECTION: true,
	FRAME_OPTIONS: 'DENY'
} as const;

// Performance Configuration
export const PERFORMANCE = {
	COMPRESSION_THRESHOLD: 1024, // 1KB
	CACHE_CONTROL_MAX_AGE: 31_536_000, // 1 year
	STATIC_MAX_AGE: 31_536_000, // 1 year
	API_MAX_AGE: 300, // 5 minutes
	GZIP_LEVEL: 6
} as const;

// Feature Flags
export const FEATURES = {
	ENABLE_ANALYTICS: true,
	ENABLE_ERROR_REPORTING: true,
	ENABLE_PERFORMANCE_MONITORING: true,
	ENABLE_DEBUG_MODE: false,
	ENABLE_MAINTENANCE_MODE: false
} as const;

// Polling Configuration
export const POLLING = {
	DEFAULTS: {
		baseInterval: 2000,
		maxInterval: 10_000,
		maxBackoffMultiplier: 3,
		timeoutDuration: 5_000,
		earlyTimeoutDuration: 3_000,
		backgroundMultiplier: 5,
		debugPolling: false
	}
} as const;

// Type definitions
export type Environment = keyof typeof ENVIRONMENT;
export type LogLevel = keyof typeof LOGGING.LEVELS;
