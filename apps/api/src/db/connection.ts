import {drizzle} from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '@bim/db';

const { Pool } = pg;

export type Database = ReturnType<typeof drizzle<typeof schema>>;

let pool: pg.Pool | undefined;
let db: Database | undefined;

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
      console.error('Unexpected database pool error:', err);
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
    console.error('Database connection test failed:', error);
    return false;
  }
}
