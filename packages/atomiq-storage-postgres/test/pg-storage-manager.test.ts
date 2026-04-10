import type {StorageObject} from '@atomiqlabs/base';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {PgStorageManager} from '../src';

class FakeStorageObject implements StorageObject {
  constructor(public readonly data: unknown) {}
  serialize(): unknown {
    return this.data;
  }
}

function createMockPool(): {pool: unknown; calls: {sql: string; params: unknown[] | undefined}[]} {
  const calls: {sql: string; params: unknown[] | undefined}[] = [];
  const pool = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      calls.push({sql, params});
      return {rows: []};
    }),
  };
  return {pool, calls};
}

describe('PgStorageManager', () => {

  let pool: ReturnType<typeof createMockPool>['pool'];
  let calls: ReturnType<typeof createMockPool>['calls'];

  beforeEach(() => {
    ({pool, calls} = createMockPool());
  });

  describe('constructor', () => {
    it('uses default table name', () => {
      const storage = new PgStorageManager(pool as never);
      expect(storage).toBeDefined();
    });

    it('accepts custom table name', () => {
      const storage = new PgStorageManager(pool as never, 'custom_store');
      expect(storage).toBeDefined();
    });
  });

  describe('init', () => {
    it('creates table with correct SQL', async () => {
      const storage = new PgStorageManager(pool as never, 'my_store');
      await storage.init();

      expect((pool as {query: ReturnType<typeof vi.fn>}).query).toHaveBeenCalledOnce();
      const sql = calls[0]!.sql;
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS "my_store"');
      expect(sql).toContain('id VARCHAR(255) PRIMARY KEY');
      expect(sql).toContain('value TEXT NOT NULL');
    });
  });

  describe('assertInitialized', () => {
    it('throws on saveData before init', async () => {
      const storage = new PgStorageManager<FakeStorageObject>(pool as never);
      const obj = new FakeStorageObject({foo: 'bar'});
      await expect(storage.saveData('key1', obj)).rejects.toThrow('Storage not initialized');
    });

    it('throws on loadData before init', async () => {
      const storage = new PgStorageManager<FakeStorageObject>(pool as never);
      await expect(storage.loadData(FakeStorageObject)).rejects.toThrow('Storage not initialized');
    });

    it('throws on removeData before init', async () => {
      const storage = new PgStorageManager<FakeStorageObject>(pool as never);
      await expect(storage.removeData('key1')).rejects.toThrow('Storage not initialized');
    });

    it('throws on removeDataArr before init', async () => {
      const storage = new PgStorageManager<FakeStorageObject>(pool as never);
      await expect(storage.removeDataArr(['key1'])).rejects.toThrow('Storage not initialized');
    });
  });

  describe('saveData', () => {
    it('inserts with upsert SQL and serialized value', async () => {
      const storage = new PgStorageManager<FakeStorageObject>(pool as never, 'my_store');
      await storage.init();

      const obj = new FakeStorageObject({foo: 'bar'});
      await storage.saveData('key1', obj);

      expect((pool as {query: ReturnType<typeof vi.fn>}).query).toHaveBeenCalledTimes(2);
      const saveCall = calls[1]!;
      expect(saveCall.sql).toContain('INSERT INTO "my_store"');
      expect(saveCall.sql).toContain('ON CONFLICT(id) DO UPDATE SET value = $2');
      expect(saveCall.params).toEqual(['key1', JSON.stringify({foo: 'bar'})]);
    });
  });

  describe('saveDataArr', () => {
    it('saves each item sequentially', async () => {
      const storage = new PgStorageManager<FakeStorageObject>(pool as never);
      await storage.init();

      const objects = [
        {id: 'a', object: new FakeStorageObject({x: 1})},
        {id: 'b', object: new FakeStorageObject({x: 2})},
        {id: 'c', object: new FakeStorageObject({x: 3})},
      ];
      await storage.saveDataArr(objects);

      expect((pool as {query: ReturnType<typeof vi.fn>}).query).toHaveBeenCalledTimes(4);
      expect(calls[1]!.params![0]).toBe('a');
      expect(calls[2]!.params![0]).toBe('b');
      expect(calls[3]!.params![0]).toBe('c');
    });
  });

  describe('loadData', () => {
    it('loads all rows, parses JSON, and populates data cache', async () => {
      const storage = new PgStorageManager<FakeStorageObject>(pool as never, 'my_store');
      await storage.init();

      (pool as {query: ReturnType<typeof vi.fn>}).query.mockResolvedValueOnce({
        rows: [
          {id: 'k1', value: JSON.stringify('data-1')},
          {id: 'k2', value: JSON.stringify('data-2')},
        ],
      });

      const results = await storage.loadData(FakeStorageObject);

      expect(results).toHaveLength(2);
      expect(results[0]!.data).toBe('data-1');
      expect(results[1]!.data).toBe('data-2');

      expect(storage.data.k1!.data).toBe('data-1');
      expect(storage.data.k2!.data).toBe('data-2');
    });

    it('clears previous data cache on reload', async () => {
      const storage = new PgStorageManager<FakeStorageObject>(pool as never);
      await storage.init();

      (pool as {query: ReturnType<typeof vi.fn>}).query.mockResolvedValueOnce({
        rows: [{id: 'old', value: JSON.stringify('old-data')}],
      });
      await storage.loadData(FakeStorageObject);
      expect(storage.data.old).toBeDefined();

      (pool as {query: ReturnType<typeof vi.fn>}).query.mockResolvedValueOnce({
        rows: [{id: 'new', value: JSON.stringify('new-data')}],
      });
      await storage.loadData(FakeStorageObject);
      expect(storage.data.old).toBeUndefined();
      expect(storage.data.new).toBeDefined();
    });
  });

  describe('removeData', () => {
    it('deletes by id', async () => {
      const storage = new PgStorageManager<FakeStorageObject>(pool as never, 'my_store');
      await storage.init();

      await storage.removeData('key1');
      const deleteCall = calls[1]!;
      expect(deleteCall.sql).toContain('DELETE FROM "my_store" WHERE id = $1');
      expect(deleteCall.params).toEqual(['key1']);
    });
  });

  describe('removeDataArr', () => {
    it('deletes multiple keys with ANY', async () => {
      const storage = new PgStorageManager<FakeStorageObject>(pool as never, 'my_store');
      await storage.init();

      await storage.removeDataArr(['a', 'b', 'c']);
      const deleteCall = calls[1]!;
      expect(deleteCall.sql).toContain('DELETE FROM "my_store" WHERE id = ANY($1::text[])');
      expect(deleteCall.params).toEqual([['a', 'b', 'c']]);
    });

    it('skips query for empty array', async () => {
      const storage = new PgStorageManager<FakeStorageObject>(pool as never);
      await storage.init();

      await storage.removeDataArr([]);
      expect((pool as {query: ReturnType<typeof vi.fn>}).query).toHaveBeenCalledOnce(); // only init
    });
  });
});
