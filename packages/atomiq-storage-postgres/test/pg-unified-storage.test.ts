import type {UnifiedStorageCompositeIndexes, UnifiedStorageIndexes, UnifiedStoredObject} from '@atomiqlabs/sdk';
import {beforeEach, describe, expect, it, type Mock, vi} from 'vitest';
import {PgUnifiedStorage} from '../src';

const sampleIndexes: UnifiedStorageIndexes = [
  {key: 'id', type: 'string', unique: true, nullable: false},
  {key: 'type', type: 'string', unique: false, nullable: false},
  {key: 'state', type: 'number', unique: false, nullable: false},
  {key: 'initiator', type: 'string', unique: false, nullable: true},
];

const sampleCompositeIndexes: UnifiedStorageCompositeIndexes = [
  {keys: ['type', 'state'], unique: false},
];

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

type QueryFn = (sql: string, params?: unknown[]) => Promise<{rows: unknown[]}>;

function mockPool(pool: unknown): {query: Mock<QueryFn>} {
  return pool as {query: Mock<QueryFn>};
}

describe('PgUnifiedStorage', () => {

  let pool: unknown;
  let calls: {sql: string; params: unknown[] | undefined}[];

  beforeEach(() => {
    ({pool, calls} = createMockPool());
  });

  describe('init', () => {
    it('creates table with indexed columns', async () => {
      const storage = new PgUnifiedStorage(pool as never, 'my_swaps');
      await storage.init(sampleIndexes, sampleCompositeIndexes);

      const createSql = calls[0]!.sql;
      expect(createSql).toContain('CREATE TABLE IF NOT EXISTS "my_swaps"');
      expect(createSql).toContain('"type" TEXT NOT NULL');
      expect(createSql).toContain('"state" INTEGER NOT NULL');
      expect(createSql).toContain('"initiator" TEXT NULL');
      expect(createSql).toContain('data TEXT NOT NULL');
    });

    it('creates indexes for each indexed column', async () => {
      const storage = new PgUnifiedStorage(pool as never, 'my_swaps');
      await storage.init(sampleIndexes, sampleCompositeIndexes);

      const indexSqls = calls.slice(1).map((call) => call.sql);
      expect(indexSqls).toContainEqual(expect.stringContaining('idx_my_swaps_type'));
      expect(indexSqls).toContainEqual(expect.stringContaining('idx_my_swaps_state'));
      expect(indexSqls).toContainEqual(expect.stringContaining('idx_my_swaps_initiator'));
    });

    it('creates composite indexes', async () => {
      const storage = new PgUnifiedStorage(pool as never, 'my_swaps');
      await storage.init(sampleIndexes, sampleCompositeIndexes);

      const indexSqls = calls.map((call) => call.sql);
      expect(indexSqls).toContainEqual(expect.stringContaining('idx_my_swaps_type_state'));
    });

    it('skips "id" from indexed columns', async () => {
      const storage = new PgUnifiedStorage(pool as never, 'my_swaps');
      await storage.init(sampleIndexes, []);

      const createSql = calls[0]!.sql;
      expect(createSql).not.toContain('"id" TEXT');
    });
  });

  describe('assertInitialized', () => {
    it('throws on save before init', async () => {
      const storage = new PgUnifiedStorage(pool as never);
      const obj = {id: 'test1', type: 'swap', state: 0, data: '{}'} as unknown as UnifiedStoredObject;
      await expect(storage.save(obj)).rejects.toThrow('Storage not initialized');
    });

    it('throws on query before init', async () => {
      const storage = new PgUnifiedStorage(pool as never);
      await expect(storage.query([[{key: 'id', value: 'x'}]])).rejects.toThrow('Storage not initialized');
    });
  });

  describe('save', () => {
    it('inserts with upsert and indexed columns', async () => {
      const storage = new PgUnifiedStorage(pool as never, 'my_swaps');
      await storage.init(sampleIndexes, []);

      const obj = {id: 'swap1', type: 'fromBTC', state: 1, initiator: 'alice'} as unknown as UnifiedStoredObject;
      await storage.save(obj);

      const saveCall = calls.at(-1)!;
      expect(saveCall.sql).toContain('INSERT INTO "my_swaps"');
      expect(saveCall.sql).toContain('ON CONFLICT(id) DO UPDATE SET');
      expect(saveCall.params![0]).toBe('swap1');
      expect(saveCall.params![1]).toBe('fromBTC');
      expect(saveCall.params![2]).toBe(1);
      expect(saveCall.params![3]).toBe('alice');
      expect(saveCall.params![4]).toBe(JSON.stringify(obj));
    });
  });

  describe('saveAll', () => {
    it('saves each item sequentially', async () => {
      const storage = new PgUnifiedStorage(pool as never, 'my_swaps');
      await storage.init(sampleIndexes, []);
      const initCallCount = calls.length;

      const objects = [
        {id: 'a', type: 'x', state: 0, initiator: 'u1'},
        {id: 'b', type: 'y', state: 1, initiator: 'u2'},
      ] as unknown as UnifiedStoredObject[];
      await storage.saveAll(objects);

      expect(mockPool(pool).query).toHaveBeenCalledTimes(initCallCount + 2);
    });
  });

  describe('query', () => {
    it('builds WHERE clause with AND/OR', async () => {
      const storage = new PgUnifiedStorage(pool as never, 'my_swaps');
      await storage.init(sampleIndexes, []);

      const originalQuery = mockPool(pool).query.getMockImplementation()!;
      mockPool(pool).query.mockImplementationOnce(async (sql: string, params?: unknown[]) => {
        calls.push({sql, params});
        return {rows: [{data: JSON.stringify({id: 'swap1', type: 'fromBTC'})}]};
      });

      const results = await storage.query([
        [{key: 'type', value: 'fromBTC'}, {key: 'state', value: 1}],
        [{key: 'id', value: 'swap99'}],
      ]);

      const queryCall = calls.find((call) => call.sql.includes('WHERE'));
      expect(queryCall).toBeDefined();
      expect(queryCall!.sql).toContain('("type" = $1 AND "state" = $2)');
      expect(queryCall!.sql).toContain('("id" = $3)');
      expect(queryCall!.sql).toContain(' OR ');
      expect(queryCall!.params).toEqual(['fromBTC', 1, 'swap99']);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('swap1');
      mockPool(pool).query.mockImplementation(originalQuery);
    });

    it('supports array values with ANY', async () => {
      const storage = new PgUnifiedStorage(pool as never, 'my_swaps');
      await storage.init(sampleIndexes, []);

      const originalQuery = mockPool(pool).query.getMockImplementation()!;
      mockPool(pool).query.mockImplementationOnce(async (sql: string, params?: unknown[]) => {
        calls.push({sql, params});
        return {rows: []};
      });

      await storage.query([[{key: 'type', value: ['fromBTC', 'toBTC']}]]);

      const queryCall = calls.find((call) => call.sql.includes('WHERE'));
      expect(queryCall).toBeDefined();
      expect(queryCall!.sql).toContain('"type" = ANY($1)');
      expect(queryCall!.params).toEqual([['fromBTC', 'toBTC']]);
      mockPool(pool).query.mockImplementation(originalQuery);
    });

    it('throws for non-indexed column', async () => {
      const storage = new PgUnifiedStorage(pool as never, 'my_swaps');
      await storage.init(sampleIndexes, []);

      await expect(
        storage.query([[{key: 'unknown_col', value: 'x'}]]),
      ).rejects.toThrow('non-indexed column');
    });
  });

  describe('remove', () => {
    it('deletes by id', async () => {
      const storage = new PgUnifiedStorage(pool as never, 'my_swaps');
      await storage.init(sampleIndexes, []);

      const obj = {id: 'swap1'} as UnifiedStoredObject;
      await storage.remove(obj);

      const deleteCall = calls.at(-1)!;
      expect(deleteCall.sql).toContain('DELETE FROM "my_swaps" WHERE id = $1');
      expect(deleteCall.params).toEqual(['swap1']);
    });
  });

  describe('removeAll', () => {
    it('deletes multiple with ANY', async () => {
      const storage = new PgUnifiedStorage(pool as never, 'my_swaps');
      await storage.init(sampleIndexes, []);

      const objects = [
        {id: 'a'},
        {id: 'b'},
        {id: 'c'},
      ] as UnifiedStoredObject[];
      await storage.removeAll(objects);

      const deleteCall = calls.at(-1)!;
      expect(deleteCall.sql).toContain('DELETE FROM "my_swaps" WHERE id = ANY($1::text[])');
      expect(deleteCall.params).toEqual([['a', 'b', 'c']]);
    });

    it('skips query for empty array', async () => {
      const storage = new PgUnifiedStorage(pool as never, 'my_swaps');
      await storage.init(sampleIndexes, []);
      const countBefore = calls.length;

      await storage.removeAll([]);
      expect(calls.length).toBe(countBefore);
    });
  });
});
