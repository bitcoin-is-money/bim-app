import * as schema from '@bim/db';
import {drizzle} from 'drizzle-orm/node-postgres';
import {basename} from "node:path";
import pg from 'pg';
import type {Logger} from 'pino';

const { Pool } = pg;

export type Database = ReturnType<typeof drizzle<typeof schema>>;

let pool: pg.Pool | undefined;
let db: Database | undefined;
let poolLogger: Logger | undefined;

/**
 * Sets the logger for pool error reporting.
 * Call this after creating the pino logger.
 */
export function setPoolLogger(logger: Logger): void {
  poolLogger = logger.child({name: basename(import.meta.filename)});
}

/**
 * Gets the database connection pool.
 * Creates a new pool if one doesn't exist.
 */
export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

    pool = new Pool({
      connectionString,
      ssl:
        process.env.NODE_ENV === 'production'
          ? { rejectUnauthorized: true }
          : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    pool.on('error', (err) => {
      if (poolLogger) {
        poolLogger.error({err: {name: err.name, message: err.message}}, 'Unexpected database pool error');
      }
    });
  }

  return pool;
}

/**
 * Gets the Drizzle database instance.
 */
export function getDb(): Database {
  db ??= drizzle(getPool(), {schema});
  return db;
}

/**
 * Closes the database connection pool.
 */
export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
    db = undefined;
  }
}

/**
 * Tests the database connection.
 */
export async function testConnection(): Promise<boolean> {
  try {
    const result = await getPool().query('SELECT 1');
    return result.rowCount === 1;
  } catch (error) {
    if (poolLogger) {
      poolLogger.error({err: error instanceof Error ? {name: error.name, message: error.message} : error}, 'Database connection test failed');
    }
    return false;
  }
}
