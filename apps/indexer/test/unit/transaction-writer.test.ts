import type {NewTransactionRecord} from '@bim/db';
import {createLogger} from '@bim/lib/logger';
import type {Logger} from "pino";
import {describe, expect, it, vi} from 'vitest';
import {INDEXER_LOGGER_CONFIG} from "../../src/wbtc-transfer/logger-config";
import {TransactionWriter} from '../../src/wbtc-transfer/transaction-writer.js';
import type {ApibaraDb} from '../../src/wbtc-transfer/types.js';

const LOG_LEVEL = 'silent';

const logger: Logger = createLogger(LOG_LEVEL, INDEXER_LOGGER_CONFIG);
const writer = new TransactionWriter(logger);

function mockDb(insertThrows = false) {
  const onConflictDoNothing = insertThrows
    ? vi.fn().mockRejectedValue(new Error('DB insert failed'))
    : vi.fn().mockResolvedValue(undefined);

  return {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({onConflictDoNothing}),
    }),
  } as unknown as ApibaraDb;
}

function makeRow(overrides: Partial<NewTransactionRecord> = {}): NewTransactionRecord {
  return {
    id: crypto.randomUUID(),
    accountId: 'acc-1',
    transactionHash: '0x' + 'a'.repeat(64),
    blockNumber: '100',
    transactionType: 'receipt',
    amount: '4096',
    tokenAddress: '0x' + 'c'.repeat(64),
    fromAddress: '0x' + '1'.repeat(64),
    toAddress: '0x' + '2'.repeat(64),
    timestamp: new Date(),
    indexedAt: new Date(),
    ...overrides,
  };
}

describe('TransactionWriter', () => {
  it('inserts rows with onConflictDoNothing', async () => {
    const db = mockDb();
    await writer.write(db, [makeRow()], '100');

    expect(db.insert).toHaveBeenCalledOnce();
  });

  it('skips insert when rows are empty', async () => {
    const db = mockDb();
    await writer.write(db, [], '100');

    expect(db.insert).not.toHaveBeenCalled();
  });

  it('propagates DB errors', async () => {
    const db = mockDb(true);

    await expect(writer.write(db, [makeRow()], '100')).rejects.toThrow('DB insert failed');
  });
});
