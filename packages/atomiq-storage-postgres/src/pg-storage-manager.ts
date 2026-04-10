import type {IStorageManager, StorageObject} from '@atomiqlabs/base';
import type pg from 'pg';

/**
 * PostgreSQL-based storage manager for persisting StorageObject instances.
 * Drop-in replacement for SqliteStorageManager from @atomiqlabs/storage-sqlite.
 *
 * Uses a simple key-value table (id, value) where value is JSON-serialized text.
 */
export class PgStorageManager<T extends StorageObject> implements IStorageManager<T> {

  private readonly pool: pg.Pool;
  private readonly tableName: string;
  private initialized = false;

  /** In-memory cache of stored objects, keyed by hash, required by IStorageManager */
  data: Record<string, T> = {};

  constructor(pool: pg.Pool, tableName = 'atomiq_store') {
    this.pool = pool;
    this.tableName = tableName;
  }

  async init(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS "${this.tableName}" (
        id VARCHAR(255) PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    this.initialized = true;
  }

  async saveData(hash: string, object: T): Promise<void> {
    this.assertInitialized();
    await this.pool.query(
      `INSERT INTO "${this.tableName}" (id, value) VALUES ($1, $2)
       ON CONFLICT(id) DO UPDATE SET value = $2;`,
      [hash, JSON.stringify(object.serialize())],
    );
  }

  async saveDataArr(values: { id: string; object: T }[]): Promise<void> {
    for (const val of values) {
      await this.saveData(val.id, val.object);
    }
  }

  async loadData(type: new(data: unknown) => T): Promise<T[]> {
    this.assertInitialized();
    const result = await this.pool.query(`SELECT * FROM "${this.tableName}"`);
    this.data = {};
    const allData: T[] = [];
    for (const row of result.rows as {id: string; value: string}[]) {
      const parsed: unknown = JSON.parse(row.value);
      const obj = new type(parsed);
      this.data[row.id] = obj;
      allData.push(obj);
    }
    return allData;
  }

  async removeData(hash: string): Promise<void> {
    this.assertInitialized();
    await this.pool.query(`DELETE FROM "${this.tableName}" WHERE id = $1`, [hash]);
  }

  async removeDataArr(keys: string[]): Promise<void> {
    this.assertInitialized();
    if (keys.length === 0) return;
    await this.pool.query(
      `DELETE FROM "${this.tableName}" WHERE id = ANY($1::text[])`,
      [keys],
    );
  }

  private assertInitialized(): void {
    if (!this.initialized) {
      throw new Error('Storage not initialized! Call init() first.');
    }
  }
}
