import * as schema from '@bim/db';
import {getTableName} from "drizzle-orm";
import {drizzle} from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type {Logger} from 'pino';

export type Database = ReturnType<typeof drizzle<typeof schema>>;

export type DatabaseSslMode = 'off' | 'allow-self-signed' | 'strict';

export type DatabaseConfig = {
  url: string;
  sslMode: DatabaseSslMode;
}

/**
 * Encapsulates the PostgreSQL connection pool and Drizzle ORM instance.
 * Use `DatabaseConnection.init(logger)` once at startup, then `DatabaseConnection.get()` everywhere.
 */
export class DatabaseConnection {
  private static instance: DatabaseConnection | undefined;

  private readonly config: DatabaseConfig;
  private readonly logger: Logger;
  private pool: pg.Pool | undefined;
  private db: Database | undefined;

  private constructor(config: DatabaseConfig, logger: Logger) {
    this.config = config;
    this.logger = logger.child({name: 'DatabaseConnection'});
    this.logger.debug('Initialized');
  }

  /**
   * Initializes the singleton instance with config and logger.
   * Must be called once at startup before any `get()` call.
   */
  static async initialize(config: DatabaseConfig, rootLogger: Logger): Promise<DatabaseConnection> {
    if (DatabaseConnection.instance) {
      throw new Error('DatabaseConnection already initialized, initialize should not be called twice');
    }
    DatabaseConnection.instance = new DatabaseConnection(config, rootLogger);
    await DatabaseConnection.get().assertConnectionAvailable();
    await DatabaseConnection.get().assertSchemaReady();

    return DatabaseConnection.instance;
  }

  /**
   * Returns the singleton instance. Throws if `init()` was not called.
   */
  static get(): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      throw new Error('DatabaseConnection not initialized — call DatabaseConnection.init(logger) first');
    }
    return DatabaseConnection.instance;
  }

  /**
   * Resets the singleton (for testing only).
   */
  static reset(): void {
    DatabaseConnection.instance = undefined;
  }

  /**
   * Returns the underlying pg.Pool, creating it lazily on the first call.
   */
  getPool(): pg.Pool {
    if (!this.pool) {
      this.logger.debug('Creating connection pool');
      this.pool = new pg.Pool({
        connectionString: this.config.url,
        ...(this.config.sslMode !== 'off' && {
          ssl: {rejectUnauthorized: this.config.sslMode === 'strict'},
        }),
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
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
  getDb(): Database {
    this.db ??= drizzle(this.getPool(), {schema});
    return this.db;
  }

  /**
   * Asserts that the database is reachable. Exits the process if not.
   */
  async assertConnectionAvailable(): Promise<void> {
    this.logger.debug('Checking database connection');
    const dbOk = await DatabaseConnection.get().testConnection();
    if (!dbOk) {
      this.logger.fatal('Database connection failed');
      process.exit(1);
    }
  }

  /**
   * Asserts that the BIM schema has been pushed (checks for the bim_accounts table).
   */
  async assertSchemaReady(): Promise<void> {
    this.logger.info('Checking schema');
    const tableName = getTableName(schema.accounts);
    const result = await this.getPool().query(`
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = $1
        AND table_name = $2`, ['public', tableName],
    );
    if (result.rowCount === 0) {
      this.logger.fatal('Table "bim_accounts" does not exist. Push the schema first:\n  DATABASE_URL=... npm run db:push -w @bim/api');
      process.exit(1);
    }
    this.logger.debug('Schema OK');
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
      this.db = undefined;
      this.logger.debug('Connection pool closed');
    }
  }
}
