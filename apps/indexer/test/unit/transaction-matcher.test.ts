import {createLogger} from '@bim/lib/logger';
import type {Logger} from "pino";
import {describe, expect, it} from 'vitest';
import {INDEXER_LOGGER_CONFIG} from "../../src/wbtc-transfer/logger-config";
import {TransactionMatcher} from '../../src/wbtc-transfer/transaction-matcher.js';
import type {AccountMatch} from '../../src/wbtc-transfer/types.js';

const LOG_LEVEL = 'silent';

const ALICE = '0x' + '1'.repeat(64);
const BOB = '0x' + '2'.repeat(64);
const STRANGER = '0x' + '9'.repeat(64);
const TX_HASH = '0x' + 'a'.repeat(64);
const WBTC = '0x' + 'c'.repeat(64);

const logger: Logger = createLogger(LOG_LEVEL, INDEXER_LOGGER_CONFIG);
const matcher = new TransactionMatcher(WBTC, logger);

const accounts: AccountMatch[] = [
  {id: 'acc-alice', starknetAddress: ALICE},
  {id: 'acc-bob', starknetAddress: BOB},
];
const timestamp = new Date('2025-01-01T00:00:00Z');

describe('TransactionMatcher', () => {
  it('creates receipt row when to matches an account', () => {
    const transfers = [{from: STRANGER, to: ALICE, amount: '4096', txHash: TX_HASH}];
    const rows = matcher.match(transfers, accounts, '100', timestamp);

    expect(rows).toHaveLength(1);
    expect(rows[0].accountId).toBe('acc-alice');
    expect(rows[0].transactionType).toBe('receipt');
    expect(rows[0].amount).toBe('4096');
    expect(rows[0].toAddress).toBe(ALICE);
    expect(rows[0].fromAddress).toBe(STRANGER);
  });

  it('creates spent row when from matches an account', () => {
    const transfers = [{from: ALICE, to: STRANGER, amount: '4096', txHash: TX_HASH}];
    const rows = matcher.match(transfers, accounts, '100', timestamp);

    expect(rows).toHaveLength(1);
    expect(rows[0].accountId).toBe('acc-alice');
    expect(rows[0].transactionType).toBe('spent');
  });

  it('creates both spent and receipt rows when from and to match different accounts', () => {
    const transfers = [{from: ALICE, to: BOB, amount: '4096', txHash: TX_HASH}];
    const rows = matcher.match(transfers, accounts, '100', timestamp);

    expect(rows).toHaveLength(2);
    const spent = rows.find(r => r.transactionType === 'spent')!;
    const receipt = rows.find(r => r.transactionType === 'receipt')!;
    expect(spent.accountId).toBe('acc-alice');
    expect(receipt.accountId).toBe('acc-bob');
  });

  it('returns empty array when no accounts match', () => {
    const transfers = [{from: STRANGER, to: '0x' + '8'.repeat(64), amount: '4096', txHash: TX_HASH}];
    const rows = matcher.match(transfers, accounts, '100', timestamp);

    expect(rows).toHaveLength(0);
  });

  it('returns empty for empty transfers', () => {
    expect(matcher.match([], accounts, '100', timestamp)).toEqual([]);
  });

  it('sets correct metadata on rows', () => {
    const transfers = [{from: STRANGER, to: ALICE, amount: '4096', txHash: TX_HASH}];
    const rows = matcher.match(transfers, accounts, '500', timestamp);

    expect(rows[0].blockNumber).toBe('500');
    expect(rows[0].tokenAddress).toBe(WBTC);
    expect(rows[0].transactionHash).toBe(TX_HASH);
    expect(rows[0].timestamp).toBe(timestamp);
  });

  it('aggregates multiple transfers in same txHash into one spent row', () => {
    const TREASURY = '0x' + '5'.repeat(64);
    const transfers = [
      {from: ALICE, to: BOB, amount: '1000', txHash: TX_HASH},
      {from: ALICE, to: TREASURY, amount: '1', txHash: TX_HASH},
    ];
    const rows = matcher.match(transfers, accounts, '100', timestamp);

    const spentRows = rows.filter(r => r.transactionType === 'spent');
    expect(spentRows).toHaveLength(1);
    expect(spentRows[0].amount).toBe('1001'); // 1000 + 1
    expect(spentRows[0].toAddress).toBe(BOB); // keeps primary (largest) transfer address
  });

  it('aggregates multiple receipts in same txHash into one receipt row', () => {
    const STRANGER2 = '0x' + '8'.repeat(64);
    const transfers = [
      {from: STRANGER, to: ALICE, amount: '500', txHash: TX_HASH},
      {from: STRANGER2, to: ALICE, amount: '100', txHash: TX_HASH},
    ];
    const rows = matcher.match(transfers, accounts, '100', timestamp);

    const receiptRows = rows.filter(r => r.transactionType === 'receipt');
    expect(receiptRows).toHaveLength(1);
    expect(receiptRows[0].amount).toBe('600'); // 500 + 100
    expect(receiptRows[0].fromAddress).toBe(STRANGER); // keeps primary (largest) transfer address
  });

  it('keeps spent and receipt separate even in same txHash', () => {
    // Alice sends to Bob — produces 1 spent (Alice) + 1 receipt (Bob), not aggregated
    const transfers = [{from: ALICE, to: BOB, amount: '4096', txHash: TX_HASH}];
    const rows = matcher.match(transfers, accounts, '100', timestamp);

    expect(rows).toHaveLength(2);
    expect(rows.find(r => r.transactionType === 'spent')!.accountId).toBe('acc-alice');
    expect(rows.find(r => r.transactionType === 'receipt')!.accountId).toBe('acc-bob');
  });

  it('handles case-insensitive address matching', () => {
    const upperAccounts: AccountMatch[] = [
      {id: 'acc-1', starknetAddress: '0x' + 'A'.repeat(64)},
    ];
    const transfers = [{from: STRANGER, to: '0x' + 'a'.repeat(64), amount: '100', txHash: TX_HASH}];
    const rows = matcher.match(transfers, upperAccounts, '100', timestamp);

    expect(rows).toHaveLength(1);
    expect(rows[0].accountId).toBe('acc-1');
  });
});
