import {beforeEach, describe, expect, it, vi} from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks (hoisted by vitest before any import)
// ---------------------------------------------------------------------------

vi.mock('@bim/lib/logger', async (importOriginal) => {

  const LOG_LEVEL = 'silent';

  const mod = await importOriginal<typeof import('@bim/lib/logger')>();
  const logger = mod.createLogger(LOG_LEVEL, {...mod.DEFAULT_LOGGER_CONFIG, requestId: undefined});
  for (const m of ['fatal', 'error', 'warn', 'info', 'debug', 'trace']) {
    vi.spyOn(logger, m as any);
  }
  vi.spyOn(logger, 'child').mockReturnValue(logger as any);
  return {createLogger: vi.fn(() => logger)};
});

vi.mock('@bim/lib/url', () => ({
  redactUrl: vi.fn((url: string) => '***'),
}));

vi.mock('drizzle-orm/node-postgres', () => ({drizzle: vi.fn()}));
vi.mock('drizzle-orm', () => ({
  getTableName: vi.fn(() => 'transactions'),
  sql: vi.fn(),
}));

vi.mock('@apibara/plugin-drizzle', () => ({
  drizzle: vi.fn(() => ({})),
  drizzleStorage: vi.fn(() => (() => {})),
  useDrizzleStorage: vi.fn(() => ({db: {}})),
}));

vi.mock('@apibara/starknet', () => ({
  getSelector: vi.fn(() => '0xTransferSelector'),
  StarknetStream: {},
}));

vi.mock('@apibara/indexer', () => ({
  defineIndexer: vi.fn(() => (config: Record<string, unknown>) => config),
}));

vi.mock('@bim/db', () => ({transactions: {id: Symbol('id')}}));

vi.mock('../../src/wbtc-transfer/logger-config.js', () => ({
  INDEXER_LOGGER_CONFIG: {},
}));

vi.mock('../../src/wbtc-transfer/transfer-event-decoder.js', () => ({
  TransferEventDecoder: vi.fn(function () {
    return {decode: vi.fn(() => [])};
  }),
}));

vi.mock('../../src/wbtc-transfer/account-cache.js', () => ({
  AccountCache: vi.fn(function () {
    return {get: vi.fn(() => Promise.resolve([]))};
  }),
}));

vi.mock('../../src/wbtc-transfer/transaction-matcher.js', () => ({
  TransactionMatcher: vi.fn(function () {
    return {match: vi.fn(() => [])};
  }),
}));

vi.mock('../../src/wbtc-transfer/transaction-writer.js', () => ({
  TransactionWriter: vi.fn(function () {
    return {write: vi.fn(() => Promise.resolve())};
  }),
}));

// ---------------------------------------------------------------------------
// Imports (resolved against mocks above)
// ---------------------------------------------------------------------------

import {createLogger, DEFAULT_LOGGER_CONFIG} from '@bim/lib/logger';
import {drizzle} from 'drizzle-orm/node-postgres';
import {INDEXER_LOGGER_CONFIG} from "../../src/wbtc-transfer/logger-config";
import {TransferEventDecoder} from '../../src/wbtc-transfer/transfer-event-decoder.js';
import {AccountCache} from '../../src/wbtc-transfer/account-cache.js';
import {TransactionWriter} from '../../src/wbtc-transfer/transaction-writer.js';
import {createWbtcTransferIndexer, type WbtcRuntimeConfig} from '../../src/wbtc-transfer/indexer.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getLogger(): Record<string, ReturnType<typeof vi.fn>> {
  return (createLogger as any)();
}

function makeConfig(
  overrides: Partial<WbtcRuntimeConfig> = {},
): WbtcRuntimeConfig {
  return {
    connectionString: 'postgresql://test',
    streamUrl: 'https://stream.test',
    contractAddress: '0x123',
    startingBlock: '0',
    accountCacheTtlMs: '60000',
    ...overrides,
  } as WbtcRuntimeConfig;
}

function mockDbSuccess() {
  vi.mocked(drizzle).mockReturnValue({
    execute: vi.fn().mockResolvedValue({rowCount: 1}),
  } as unknown as ReturnType<typeof drizzle>);
}

function mockDatabaseNotStarted() {
  vi.mocked(drizzle).mockReturnValue({
    execute: vi.fn().mockRejectedValue(new Error('connection refused')),
  } as unknown as ReturnType<typeof drizzle>);
}

function mockTableDoesNotExist() {
  const dbStarted = {execute: vi.fn().mockResolvedValue({rowCount: 1})};
  const dbNoTable = {execute: vi.fn().mockResolvedValue({rowCount: 0})};
  vi.mocked(drizzle)
    .mockReturnValueOnce(dbStarted as unknown as ReturnType<typeof drizzle>)
    .mockReturnValueOnce(dbNoTable as unknown as ReturnType<typeof drizzle>);
}

// Prevent real process termination; throw so execution stops like a real exit.
const exitSpy = vi
  .spyOn(process, 'exit')
  .mockImplementation(((code?: number) => { throw new Error(`process.exit(${code})`); }) as never);
vi.spyOn(process, 'kill').mockImplementation(() => true);

// ---------------------------------------------------------------------------
// Reset between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  getLogger().child.mockReturnValue(getLogger());
  mockDbSuccess();

  vi.mocked(TransferEventDecoder).mockImplementation(function () {
    return {decode: vi.fn(() => [])} as any;
  });
  vi.mocked(AccountCache).mockImplementation(function () {
    return {get: vi.fn(() => Promise.resolve([]))} as any;
  });
  vi.mocked(TransactionWriter).mockImplementation(function () {
    return {write: vi.fn(() => Promise.resolve())} as any;
  });

  exitSpy.mockImplementation(((code?: number) => { throw new Error(`process.exit(${code})`); }) as never);
  vi.spyOn(process, 'kill').mockImplementation(() => true);
});

// ---------------------------------------------------------------------------
// Tests — startup
// ---------------------------------------------------------------------------

describe('createWbtcTransferIndexer', () => {
  it('returns the indexer definition on success', async () => {
    const result = await createWbtcTransferIndexer(makeConfig());

    expect(result).toBeDefined();
    expect(result).toHaveProperty('transform');
    expect(result).toHaveProperty('filter');
    expect(result).toHaveProperty('streamUrl', 'https://stream.test');
  });

  it('exits when connectionString is missing', async () => {
    const cfg = makeConfig({connectionString: '' as string});

    await expect(createWbtcTransferIndexer(cfg)).rejects.toThrow('process.exit');
    expect(getLogger().fatal).toHaveBeenCalledWith('DATABASE_URL environment variable is not set');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('exits when database is not started', async () => {
    mockDatabaseNotStarted();

    await expect(createWbtcTransferIndexer(makeConfig())).rejects.toThrow('process.exit');
    expect(getLogger().fatal).toHaveBeenCalledWith(
      expect.objectContaining({message: 'connection refused'}),
      'PostgreSQL database is not started',
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('exits when transaction table does not exist', async () => {
    mockTableDoesNotExist();

    await expect(createWbtcTransferIndexer(makeConfig())).rejects.toThrow('process.exit');
    expect(getLogger().fatal).toHaveBeenCalledWith(expect.stringContaining('does not exist'));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('exits on unexpected startup error', async () => {
    vi.mocked(AccountCache).mockImplementation(function () { throw new Error('unexpected boom'); });

    await expect(createWbtcTransferIndexer(makeConfig())).rejects.toThrow('process.exit');
    expect(getLogger().fatal).toHaveBeenCalledWith(
      expect.objectContaining({message: 'unexpected boom'}),
      'Fatal startup error',
    );
  });
});

// ---------------------------------------------------------------------------
// Tests — transform error handling
// ---------------------------------------------------------------------------

describe('transform error handling', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function mockBlockArgs(blockNumber = 42n): any {
    return {
      block: {header: {timestamp: '1700000000'}, events: [{keys: ['a', 'b', 'c'], data: ['d', 'e']}]},
      endCursor: {orderKey: blockNumber},
    };
  }

  it('catches processing errors and logs them', async () => {
    vi.mocked(TransferEventDecoder).mockImplementation(function () {
      return {decode: vi.fn(() => { throw new Error('transform boom'); })} as any;
    });

    const indexer = await createWbtcTransferIndexer(makeConfig());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (indexer as any).transform(mockBlockArgs());

    expect(getLogger().error).toHaveBeenCalledWith(
      expect.objectContaining({blockNumber: '42'}),
      'Failed to process transfer block',
    );
  });

  it('does not throw when processing fails', async () => {
    vi.mocked(TransferEventDecoder).mockImplementation(function () {
      return {decode: vi.fn(() => { throw new Error('boom'); })} as any;
    });

    const indexer = await createWbtcTransferIndexer(makeConfig());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect((indexer as any).transform(mockBlockArgs())).resolves.toBeUndefined();
  });

  it('does not log error when processing succeeds', async () => {
    const indexer = await createWbtcTransferIndexer(makeConfig());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (indexer as any).transform(mockBlockArgs());

    expect(getLogger().error).not.toHaveBeenCalled();
  });
});
