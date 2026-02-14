import {createLogger} from '@bim/lib/logger';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {AccountCache} from '../../src/wbtc-transfer/account-cache.js';
import {INDEXER_LOGGER_CONFIG} from "../../src/wbtc-transfer/logger-config";

const LOG_LEVEL = 'silent';

const ALICE = {id: 'acc-alice', starknetAddress: '0x' + '1'.repeat(64)};
const BOB = {id: 'acc-bob', starknetAddress: '0x' + '2'.repeat(64)};

const logger = createLogger(LOG_LEVEL, INDEXER_LOGGER_CONFIG);

function makeMockDb(rows: {id: string; starknetAddress: string}[]) {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

describe('AccountCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fetches accounts on first call', async () => {
    const db = makeMockDb([ALICE]);
    const cache = new AccountCache(60_000, logger);

    const result = await cache.get(db);

    expect(result).toEqual([ALICE]);
    expect(db.select).toHaveBeenCalledOnce();
  });

  it('returns cached accounts within TTL', async () => {
    const db = makeMockDb([ALICE]);
    const cache = new AccountCache(60_000, logger);

    await cache.get(db);
    vi.advanceTimersByTime(30_000);
    const result = await cache.get(db);

    expect(result).toEqual([ALICE]);
    expect(db.select).toHaveBeenCalledOnce();
  });

  it('refreshes after TTL expires', async () => {
    const db = makeMockDb([ALICE]);
    const cache = new AccountCache(60_000, logger);

    await cache.get(db);

    db.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([ALICE, BOB]),
      }),
    });

    vi.advanceTimersByTime(60_001);
    const result = await cache.get(db);

    expect(result).toEqual([ALICE, BOB]);
    expect(db.select).toHaveBeenCalledTimes(2);
  });

  it('returns empty array when no accounts exist', async () => {
    const db = makeMockDb([]);
    const cache = new AccountCache(60_000, logger);

    const result = await cache.get(db);

    expect(result).toEqual([]);
  });
});
