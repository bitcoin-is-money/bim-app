/**
 * @fileoverview Database Connection and Configuration Manager
 *
 * This module manages the PostgreSQL database connection for the WebAuthn Starknet
 * account deployment application. It provides:
 *
 * - Conditional database initialization based on environment
 * - Production-optimized connection settings for Railway deployment
 * - Connection pooling and lifecycle management
 * - SSL configuration for secure connections
 * - Graceful degradation when database is not configured
 * - Drizzle ORM integration with schema definitions
 *
 * Architecture:
 * - Singleton pattern for database connection management
 * - Lazy initialization to avoid connection overhead
 * - Environment-aware configuration
 * - Connection pooling optimized for serverless environments
 *
 * @requires drizzle-orm/postgres-js - Drizzle ORM for PostgreSQL
 * @requires postgres - PostgreSQL client library
 * @requires $lib/config/server - Server-side environment variables
 * @requires ./schema - Database schema definitions
 *
 * @author bim
 * @version 1.0.0
 */

import { ServerPrivateEnv } from '$lib/config/server';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

/**
 * Global database connection instances
 *
 * These are maintained as module-level variables to implement
 * the singleton pattern and ensure consistent database access
 * across the application.
 */
let client: postgres.Sql | null = null;
let db: ReturnType<typeof drizzle> | null = null;

/**
 * Initialize database connection with production-optimized settings
 *
 * Creates a PostgreSQL connection optimized for Railway's serverless environment:
 * - Limited connection pool size for serverless constraints
 * - Aggressive idle timeout to prevent connection leaks
 * - Fast connection timeout for responsiveness
 * - SSL configuration for production security
 *
 * The function implements lazy initialization - connections are only
 * created when first accessed, reducing startup overhead.
 *
 * @returns ReturnType<typeof drizzle> | null - Database instance or null if not configured
 *
 * Connection Settings:
 * - max: 1 connection (serverless optimization)
 * - idle_timeout: 20 seconds (prevent connection leaks)
 * - connect_timeout: 10 seconds (fast failure detection)
 * - ssl: Production SSL with relaxed certificate validation
 *
 * @example
 * ```typescript
 * const database = initDatabase();
 * if (database) {
 *   const users = await database.select().from(userTable);
 * }
 * ```
 */
function initDatabase() {
	try {
		const databaseUrl = ServerPrivateEnv.DATABASE_URL();
		if (databaseUrl && !db) {
			// Production-optimized connection for Railway serverless
			client = postgres(databaseUrl, {
				max: 1, // Limit connections for serverless
				idle_timeout: 20, // Close idle connections quickly
				connect_timeout: 10, // Fast connection timeout
				ssl:
					(typeof process !== 'undefined' ? process.env.DATABASE_SSL : null) === 'true'
						? { rejectUnauthorized: false }
						: false
			});

			// Initialize Drizzle ORM with schema
			db = drizzle(client, { schema });
		} else if (!databaseUrl && !db) {
			console.warn('DATABASE_URL not configured - database operations will fail');
		}
	} catch (error) {
		console.error('Failed to initialize database:', error);
		return null;
	}
	return db;
}

/**
 * Get database instance with lazy initialization
 *
 * This is the primary function used throughout the application
 * to access the database. It ensures the connection is initialized
 * only when needed and provides a consistent interface.
 *
 * Features:
 * - Lazy initialization on first access
 * - Singleton pattern for consistent connection
 * - Graceful handling of missing configuration
 * - Type-safe database operations
 *
 * @returns ReturnType<typeof drizzle> | null - Database instance or null
 *
 * @example
 * ```typescript
 * import { db } from '$lib/db';
 *
 * const database = db();
 * if (database) {
 *   // Database is available
 *   const result = await database.select().from(users);
 * } else {
 *   // Database not configured
 *   throw new Error('Database not available');
 * }
 * ```
 */
const getDb = () => {
	return initDatabase();
};

// Export database accessor function
export { getDb as db };

// Re-export all schema definitions for convenience
export * from './schema';
