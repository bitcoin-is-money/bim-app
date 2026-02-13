import type {Event} from '@apibara/starknet';
import {createLogger} from '@bim/lib/logger';
import type {Logger} from "pino";
import {describe, expect, it} from 'vitest';
import {INDEXER_LOGGER_CONFIG} from "../../src/wbtc-transfer/logger-config";
import {TransferEventDecoder} from '../../src/wbtc-transfer/transfer-event-decoder.js';

const LOG_LEVEL = 'silent';

const ALICE = '0x' + '1'.repeat(64);
const BOB = '0x' + '2'.repeat(64);
const TX_HASH = '0x' + 'a'.repeat(64);
const WBTC = '0x' + 'c'.repeat(64);
const TRANSFER_SELECTOR = '0x99cd8bde557814842a3121e8ddfd433a539b8c9f14bf31ebf108d12e6196e9';

const logger: Logger = createLogger(LOG_LEVEL, INDEXER_LOGGER_CONFIG, process.stdout);
const decoder = new TransferEventDecoder(logger);

function makeEvent(
  from: string,
  to: string,
  amountLow = '0x1000',
  amountHigh = '0x0',
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

describe('TransferEventDecoder', () => {
  it('decodes a valid Transfer event', () => {
    const result = decoder.decode([makeEvent(ALICE, BOB)]);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      from: ALICE,
      to: BOB,
      amount: '4096',
      txHash: TX_HASH,
    });
  });

  it('decodes u256 amount with high part', () => {
    const result = decoder.decode([makeEvent(ALICE, BOB, '0x5', '0x2')]);

    expect(result[0].amount).toBe((5n + (2n << 128n)).toString());
  });

  it('skips events with insufficient keys', () => {
    const events: Event[] = [
      {
        ...makeEvent(ALICE, BOB),
        keys: [TRANSFER_SELECTOR, ALICE] as `0x${string}`[],
      },
    ];
    expect(decoder.decode(events)).toHaveLength(0);
  });

  it('skips events with insufficient data', () => {
    const events: Event[] = [
      {
        ...makeEvent(ALICE, BOB),
        data: ['0x1000'] as `0x${string}`[],
      },
    ];
    expect(decoder.decode(events)).toHaveLength(0);
  });

  it('handles multiple events', () => {
    const result = decoder.decode([
      makeEvent(ALICE, BOB),
      makeEvent(BOB, ALICE),
    ]);
    expect(result).toHaveLength(2);
  });

  it('normalizes addresses to lowercase padded hex', () => {
    const result = decoder.decode([makeEvent('0xABC', '0xDEF')]);

    expect(result[0].from).toBe('0x' + '0'.repeat(61) + 'abc');
    expect(result[0].to).toBe('0x' + '0'.repeat(61) + 'def');
  });

  it('returns empty for empty input', () => {
    expect(decoder.decode([])).toEqual([]);
  });
});
