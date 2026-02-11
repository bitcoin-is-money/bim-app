import type {Event} from '@apibara/starknet';
import {describe, expect, it} from 'vitest';
import {buildTransactionRows, decodeTransferEvents} from '../../src/process-transfers.js';
import type {AccountMatch} from '../../src/types.js';

const ALICE = '0x' + '1'.repeat(64);
const BOB = '0x' + '2'.repeat(64);
const STRANGER = '0x' + '9'.repeat(64);
const TX_HASH = '0x' + 'a'.repeat(64);
const WBTC = '0x' + 'c'.repeat(64);
const TRANSFER_SELECTOR = '0x99cd8bde557814842a3121e8ddfd433a539b8c9f14bf31ebf108d12e6196e9';

function makeEvent(
  from: string,
  to: string,
  amountLow = '0x1000',
  amountHigh = '0x0'
): Event {
  return {
    filterIds: [0],
    address: WBTC as `0x${string}`,
    keys: [TRANSFER_SELECTOR, from, to] as `0x${string}`[],
    data: [amountLow, amountHigh] as `0x${string}`[],
    eventIndex: 0,
    transactionIndex: 0,
    transactionHash: TX_HASH as `0x${string}`,
    transactionStatus: 'succeeded',
    eventIndexInTransaction: 0,
  };
}

// ---------------------------------------------------------------------------
// decodeTransferEvents
// ---------------------------------------------------------------------------

describe('decodeTransferEvents', () => {
  it('decodes a valid Transfer event', () => {
    const result = decodeTransferEvents([makeEvent(ALICE, BOB)]);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      from: ALICE,
      to: BOB,
      amount: '4096',
      txHash: TX_HASH,
    });
  });

  it('decodes u256 amount with high part', () => {
    const result = decodeTransferEvents([makeEvent(ALICE, BOB, '0x5', '0x2')]);

    expect(result[0].amount).toBe((5n + (2n << 128n)).toString());
  });

  it('skips events with insufficient keys', () => {
    const events: Event[] = [
      {
        ...makeEvent(ALICE, BOB),
        keys: [TRANSFER_SELECTOR, ALICE] as `0x${string}`[],
      },
    ];
    expect(decodeTransferEvents(events)).toHaveLength(0);
  });

  it('skips events with insufficient data', () => {
    const events: Event[] = [
      {
        ...makeEvent(ALICE, BOB),
        data: ['0x1000'] as `0x${string}`[],
      },
    ];
    expect(decodeTransferEvents(events)).toHaveLength(0);
  });

  it('handles multiple events', () => {
    const result = decodeTransferEvents([
      makeEvent(ALICE, BOB),
      makeEvent(BOB, ALICE),
    ]);
    expect(result).toHaveLength(2);
  });

  it('normalizes addresses to lowercase padded hex', () => {
    const result = decodeTransferEvents([makeEvent('0xABC', '0xDEF')]);

    expect(result[0].from).toBe('0x' + '0'.repeat(61) + 'abc');
    expect(result[0].to).toBe('0x' + '0'.repeat(61) + 'def');
  });

  it('returns empty for empty input', () => {
    expect(decodeTransferEvents([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// buildTransactionRows
// ---------------------------------------------------------------------------

describe('buildTransactionRows', () => {
  const accounts: AccountMatch[] = [
    {id: 'acc-alice', starknetAddress: ALICE},
    {id: 'acc-bob', starknetAddress: BOB},
  ];
  const timestamp = new Date('2025-01-01T00:00:00Z');

  it('creates receipt row when to matches an account', () => {
    const transfers = [{from: STRANGER, to: ALICE, amount: '4096', txHash: TX_HASH}];
    const rows = buildTransactionRows(transfers, accounts, WBTC, '100', timestamp);

    expect(rows).toHaveLength(1);
    expect(rows[0].accountId).toBe('acc-alice');
    expect(rows[0].transactionType).toBe('receipt');
    expect(rows[0].amount).toBe('4096');
    expect(rows[0].toAddress).toBe(ALICE);
    expect(rows[0].fromAddress).toBe(STRANGER);
  });

  it('creates spent row when from matches an account', () => {
    const transfers = [{from: ALICE, to: STRANGER, amount: '4096', txHash: TX_HASH}];
    const rows = buildTransactionRows(transfers, accounts, WBTC, '100', timestamp);

    expect(rows).toHaveLength(1);
    expect(rows[0].accountId).toBe('acc-alice');
    expect(rows[0].transactionType).toBe('spent');
  });

  it('creates both spent and receipt rows when from and to match different accounts', () => {
    const transfers = [{from: ALICE, to: BOB, amount: '4096', txHash: TX_HASH}];
    const rows = buildTransactionRows(transfers, accounts, WBTC, '100', timestamp);

    expect(rows).toHaveLength(2);
    const spent = rows.find(r => r.transactionType === 'spent')!;
    const receipt = rows.find(r => r.transactionType === 'receipt')!;
    expect(spent.accountId).toBe('acc-alice');
    expect(receipt.accountId).toBe('acc-bob');
  });

  it('returns empty array when no accounts match', () => {
    const transfers = [{from: STRANGER, to: '0x' + '8'.repeat(64), amount: '4096', txHash: TX_HASH}];
    const rows = buildTransactionRows(transfers, accounts, WBTC, '100', timestamp);

    expect(rows).toHaveLength(0);
  });

  it('returns empty for empty transfers', () => {
    expect(buildTransactionRows([], accounts, WBTC, '100', timestamp)).toEqual([]);
  });

  it('sets correct metadata on rows', () => {
    const transfers = [{from: STRANGER, to: ALICE, amount: '4096', txHash: TX_HASH}];
    const rows = buildTransactionRows(transfers, accounts, WBTC, '500', timestamp);

    expect(rows[0].blockNumber).toBe('500');
    expect(rows[0].tokenAddress).toBe(WBTC);
    expect(rows[0].transactionHash).toBe(TX_HASH);
    expect(rows[0].timestamp).toBe(timestamp);
  });

  it('handles case-insensitive address matching', () => {
    const upperAccounts: AccountMatch[] = [
      {id: 'acc-1', starknetAddress: '0x' + 'A'.repeat(64)},
    ];
    const transfers = [{from: STRANGER, to: '0x' + 'a'.repeat(64), amount: '100', txHash: TX_HASH}];
    const rows = buildTransactionRows(transfers, upperAccounts, WBTC, '100', timestamp);

    expect(rows).toHaveLength(1);
    expect(rows[0].accountId).toBe('acc-1');
  });
});
