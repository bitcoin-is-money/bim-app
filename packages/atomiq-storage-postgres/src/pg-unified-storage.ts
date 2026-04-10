import type {
  IUnifiedStorage,
  QueryParams,
  UnifiedStorageCompositeIndexes,
  UnifiedStorageIndexes,
  UnifiedStoredObject,
} from '@atomiqlabs/sdk';
import type pg from 'pg';

const pgTypes: Record<string, string> = {
  number: 'INTEGER',
  string: 'TEXT',
  boolean: 'BOOLEAN',
};

/**
 * Local narrowing of the SDK's `UnifiedStoredObject` type. The SDK defines it
 * as `{id: string} & any`, which collapses to `any` and poisons every property
 * access. We cast once at each adapter boundary to this concrete shape.
 */
interface StoredRow {
  id: string;
  [key: string]: unknown;
}

/**
 * PostgreSQL-based unified storage with indexed query support.
 * Drop-in replacement for SqliteUnifiedStorage from @atomiqlabs/storage-sqlite.
 *
 * Uses the same table structure and indexing strategy as the SQLite version,
 * adapted for PostgreSQL syntax (positional parameters, CREATE INDEX IF NOT EXISTS, etc.).
 */
export class PgUnifiedStorage implements IUnifiedStorage<UnifiedStorageIndexes, UnifiedStorageCompositeIndexes> {

  private readonly pool: pg.Pool;
  private readonly tableName: string;
  private indexedColumns: string[] = [];
  private initialized = false;

  constructor(pool: pg.Pool, tableName = 'atomiq_swaps') {
    this.pool = pool;
    this.tableName = tableName;
  }

  async init(indexes: UnifiedStorageIndexes, compositeIndexes: UnifiedStorageCompositeIndexes): Promise<void> {
    const columns: string[] = [];
    this.indexedColumns = [];
    const indexStatements: string[] = [];

    for (const idx of indexes) {
      if (idx.key === 'id') continue;
      this.indexedColumns.push(idx.key);
      columns.push(
        `"${idx.key}" ${pgTypes[idx.type]} ${idx.nullable ? 'NULL' : 'NOT NULL'}`,
      );
      const unique = idx.unique ? 'UNIQUE ' : '';
      indexStatements.push(
        `CREATE ${unique}INDEX IF NOT EXISTS "idx_${this.tableName}_${idx.key}" ON "${this.tableName}"("${idx.key}");`,
      );
    }

    for (const cidx of compositeIndexes) {
      const unique = cidx.unique ? 'UNIQUE ' : '';
      const keysName = cidx.keys.join('_');
      const keysCols = cidx.keys.map((colKey) => `"${colKey}"`).join(', ');
      indexStatements.push(
        `CREATE ${unique}INDEX IF NOT EXISTS "idx_${this.tableName}_${keysName}" ON "${this.tableName}"(${keysCols});`,
      );
    }

    const createTable = `
      CREATE TABLE IF NOT EXISTS "${this.tableName}" (
        id VARCHAR(255) PRIMARY KEY,
        ${columns.join(', ')},
        data TEXT NOT NULL
      );
    `;

    await this.pool.query(createTable);
    for (const stmt of indexStatements) {
      await this.pool.query(stmt);
    }
    this.initialized = true;
  }

  async save(value: UnifiedStoredObject): Promise<void> {
    this.assertInitialized();

    const cols = ['id', ...this.indexedColumns, 'data'];
    const placeholders = cols.map((_, colIdx) => `$${colIdx + 1}`);
    const updateSet = [...this.indexedColumns, 'data']
      .map((col, colIdx) => `"${col}" = $${colIdx + 2}`)
      .join(', ');
    const colNames = cols.map((colName) => `"${colName}"`).join(', ');

    const sql = `
      INSERT INTO "${this.tableName}" (${colNames})
      VALUES (${placeholders.join(', ')})
      ON CONFLICT(id) DO UPDATE SET ${updateSet};
    `;

    const row = value as unknown as StoredRow;

    const values: unknown[] = [
      row.id,
      // eslint-disable-next-line security/detect-object-injection -- `key` comes from `this.indexedColumns`, populated only via `init()` from SDK-registered indexes, never from user input
      ...this.indexedColumns.map((key) => row[key]),
      JSON.stringify(row),
    ];

    await this.pool.query(sql, values);
  }

  async saveAll(values: UnifiedStoredObject[]): Promise<void> {
    for (const val of values) {
      await this.save(val);
    }
  }

  async query(params: QueryParams[][]): Promise<UnifiedStoredObject[]> {
    this.assertInitialized();

    const orClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    for (const orParams of params) {
      const andClauses: string[] = [];
      for (const andParam of orParams) {
        if (!this.indexedColumns.includes(andParam.key) && andParam.key !== 'id') {
          throw new Error(`Tried to query based on non-indexed column: ${andParam.key}!`);
        }
        if (Array.isArray(andParam.value)) {
          andClauses.push(`"${andParam.key}" = ANY($${paramIndex})`);
          values.push(andParam.value);
          paramIndex++;
        } else {
          andClauses.push(`"${andParam.key}" = $${paramIndex}`);
          values.push(andParam.value);
          paramIndex++;
        }
      }
      orClauses.push(`(${andClauses.join(' AND ')})`);
    }

    const sql = `SELECT * FROM "${this.tableName}" WHERE ${orClauses.join(' OR ')}`;
    const result = await this.pool.query(sql, values);
    return result.rows.map((row: {data: string}): StoredRow =>
      JSON.parse(row.data) as unknown as StoredRow,
    );
  }

  async remove(value: UnifiedStoredObject): Promise<void> {
    this.assertInitialized();
    const row = value as unknown as StoredRow;
    await this.pool.query(`DELETE FROM "${this.tableName}" WHERE id = $1`, [row.id]);
  }

  async removeAll(values: UnifiedStoredObject[]): Promise<void> {
    this.assertInitialized();
    if (values.length === 0) return;
    const ids = (values as unknown as StoredRow[]).map((val) => val.id);
    await this.pool.query(`DELETE FROM "${this.tableName}" WHERE id = ANY($1::text[])`, [ids]);
  }

  private assertInitialized(): void {
    if (!this.initialized) {
      throw new Error('Storage not initialized! Call init() first.');
    }
  }
}
