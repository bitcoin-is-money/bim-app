import {AsyncLocalStorage} from 'node:async_hooks';
import * as schema from './schema.js';
import {getTableName} from 'drizzle-orm';
import {drizzle} from 'drizzle-orm/node-postgres';
import type {PgTable} from 'drizzle-orm/pg-core';
import pg from 'pg';
import type {Logger} from 'pino';

export type DrizzleDatabase = ReturnType<typeof drizzle<typeof schema>>;

export interface DatabaseConfig {
  url: string;
  poolMax: number;
  poolIdleTimeoutMillis: number;
  connectionTimeoutMillis: number;
  startupMaxRetries: number;
  startupRetryDelayMs: number;
  startupRequiredTable: PgTable;
}

const DEFAULT_CONFIG = {
  url: '',
  poolMax: 20,
  poolIdleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  startupMaxRetries: 5,
  startupRetryDelayMs: 3000,
  startupRequiredTable: schema.transactions
};

/**
 * Encapsulates the PostgreSQL connection pool and Drizzle ORM instance.
 *
 * Two usage patterns:
 * - **Singleton** (API): `Database.initialize(config, logger)` at startup,
 *   then `Database.get()` everywhere else.
 * - **Validation only** (Indexer): `Database.checkAvailability(config, logger)`
 *   to verify connectivity and schema, without keeping a pool around.
 */
export class Database {
  private static instance: Database | undefined;
  private static readonly txStore = new AsyncLocalStorage<DrizzleDatabase>();

  private readonly config: DatabaseConfig;
  private readonly logger: Logger;
  private pool: pg.Pool | undefined;
  private drizzleDb: DrizzleDatabase | undefined;

  constructor(config: Partial<DatabaseConfig>, logger: Logger) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
    this.logger = logger.child({name: 'Database'});
    this.logger.debug('Initialized');
  }

  /**
   * Initializes the singleton instance with config and logger.
   * Validates connection and (if configured) required table existence.
   * Must be called once at startup before any `get()` call.
   */
  static async initialize(
    config: Partial<DatabaseConfig>,
    rootLogger: Logger
  ): Promise<Database> {
    if (Database.instance) {
      throw new Error('Database already initialized, initialize should not be called twice');
    }
    const conn = new Database(config, rootLogger);
    conn.assertUrlDefined();
    await conn.assertConnectionAvailable();
    await conn.assertTableExists(conn.config.startupRequiredTable);
    Database.instance = conn;
    return conn;
  }

  static async checkAvailability(
    config: Partial<DatabaseConfig>,
    rootLogger: Logger
  ): Promise<void> {
    const db = new Database(config, rootLogger);
    db.assertUrlDefined();
    await db.assertConnectionAvailable();
    await db.assertTableExists(db.config.startupRequiredTable);
    await db.close();
  }

  /**
   * Returns the singleton instance. Throws if `initialize()` was not called.
   */
  static get(): Database {
    if (!Database.instance) {
      throw new Error('Database not initialized — call Database.initialize() first');
    }
    return Database.instance;
  }

  /**
   * Resets the singleton (for testing only).
   */
  static reset(): void {
    Database.instance = undefined;
  }

  /**
   * Returns the underlying pg.Pool, creating it lazily on the first call.
   */
  getPool(): pg.Pool {
    if (!this.pool) {
      this.logger.debug('Creating connection pool');
      this.pool = new pg.Pool({
        connectionString: this.config.url,
        max: this.config.poolMax,
        idleTimeoutMillis: this.config.poolIdleTimeoutMillis,
        connectionTimeoutMillis: this.config.connectionTimeoutMillis,
      });

      this.pool.on('error', (err) => {
        this.logger.error({err}, 'Unexpected pool error');
      });
    }

    return this.pool;
  }

  /**
   * Returns the Drizzle ORM instance, creating it lazily on the first call.
   */
  getDb(): DrizzleDatabase {
    this.drizzleDb ??= drizzle(this.getPool(), {schema});
    return this.drizzleDb;
  }

  /**
   * Returns the transaction-scoped db if inside withTransaction(), else the root Drizzle instance.
   * Used by repositories to transparently participate in transactions.
   */
  resolveDb(): DrizzleDatabase {
    return Database.txStore.getStore() ?? this.getDb();
  }

  /**
   * Runs fn inside a database transaction. All repositories using resolveDb()
   * will automatically use the transaction-scoped connection.
   * Auto-rollback on error.
   */
  async withTransaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.getDb().transaction(async (tx) =>
      Database.txStore.run(tx as unknown as DrizzleDatabase, fn)
    );
  }

  /**
   * Asserts that the database is reachable, retrying on failure (handles serverless DB cold starts).
   * Throws on final failure — caller decides how to handle.
   */
  private assertUrlDefined(): void {
    if (!this.config.url) {
      throw new Error('DATABASE_URL is not set');
    }
  }

  private async assertConnectionAvailable(): Promise<void> {
    const maxRetries = this.config.startupMaxRetries;
    const delayMs = this.config.startupRetryDelayMs;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      this.logger.debug({attempt, maxRetries}, 'Checking database connection');
      const dbOk = await this.testConnection();
      if (dbOk) return;

      if (attempt < maxRetries) {
        this.logger.warn({attempt, maxRetries}, `Database not ready, retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      } else {
        throw new Error(`Database connection failed after ${maxRetries} attempts`);
      }
    }
  }

  /**
   * Asserts that a specific table exists in the public schema.
   * Throws if the table is not found (caller decides how to handle).
   */
  private async assertTableExists(table: PgTable): Promise<void> {
    const tableName = getTableName(table);
    this.logger.info(`Checking table "${tableName}" exists`);
    const result = await this.getPool().query(`
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = $1
        AND table_name = $2`, ['public', tableName],
    );
    if (result.rowCount === 0) {
      throw new Error(
        `Table "${tableName}" does not exist. Push the schema first:\n  DATABASE_URL=... npm run db:push -w @bim/db`,
      );
    }
    this.logger.debug(`Table "${tableName}" OK`);
  }

  /**
   * Tests the database connection with a simple query.
   */
  async testConnection(): Promise<boolean> {
    try {
      this.logger.info('Testing connection');
      const result = await this.getPool().query('SELECT 1');
      this.logger.debug('Connection OK');
      return result.rowCount === 1;
    } catch (err) {
      this.logger.error({err}, 'Connection test failed');
      return false;
    }
  }

  /**
   * Closes the connection pool and releases resources.
   */
  async close(): Promise<void> {
    if (this.pool) {
      this.logger.info('Closing connection pool');
      await this.pool.end();
      this.pool = undefined;
      this.drizzleDb = undefined;
      this.logger.debug('Connection pool closed');
    }
  }
}
