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

const logger: Logger = createLogger(LOG_LEVEL, INDEXER_LOGGER_CONFIG);
const decoder = new TransferEventDecoder(logger);

/** Cairo 1 format: from/to in keys (indexed) */
function makeCairo1Event(
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

/** Cairo 0 (legacy) format: from/to in data (non-indexed) */
function makeCairo0Event(
  from: string,
  to: string,
  amountLow = '0x1000',
  amountHigh = '0x0',
): Event {
  return {
    filterIds: [0],
    address: WBTC as `0x${string}`,
    keys: [TRANSFER_SELECTOR] as `0x${string}`[],
    data: [from, to, amountLow, amountHigh] as `0x${string}`[],
    eventIndex: 0,
    transactionIndex: 0,
    transactionHash: TX_HASH as `0x${string}`,
    transactionStatus: 'succeeded',
    eventIndexInTransaction: 0,
  };
}

describe('TransferEventDecoder', () => {
  describe('Cairo 1 format (indexed from/to in keys)', () => {
    it('decodes a valid Transfer event', () => {
      const result = decoder.decode([makeCairo1Event(ALICE, BOB)]);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        from: ALICE,
        to: BOB,
        amount: '4096',
        txHash: TX_HASH,
      });
    });

    it('decodes u256 amount with high part', () => {
      const result = decoder.decode([makeCairo1Event(ALICE, BOB, '0x5', '0x2')]);

      expect(result[0]!.amount).toBe((5n + (2n << 128n)).toString());
    });

    it('skips events with insufficient keys and data', () => {
      const events: Event[] = [
        {
          ...makeCairo1Event(ALICE, BOB),
          keys: [TRANSFER_SELECTOR, ALICE] as `0x${string}`[],
          data: ['0x1000'] as `0x${string}`[],
        },
      ];
      expect(decoder.decode(events)).toHaveLength(0);
    });

    it('handles multiple events', () => {
      const result = decoder.decode([
        makeCairo1Event(ALICE, BOB),
        makeCairo1Event(BOB, ALICE),
      ]);
      expect(result).toHaveLength(2);
    });

    it('normalizes addresses to lowercase padded hex', () => {
      const result = decoder.decode([makeCairo1Event('0xABC', '0xDEF')]);

      expect(result[0]!.from).toBe('0x' + '0'.repeat(61) + 'abc');
      expect(result[0]!.to).toBe('0x' + '0'.repeat(61) + 'def');
    });
  });

  describe('Cairo 0 format (non-indexed from/to in data)', () => {
    it('decodes a valid Transfer event', () => {
      const result = decoder.decode([makeCairo0Event(ALICE, BOB)]);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        from: ALICE,
        to: BOB,
        amount: '4096',
        txHash: TX_HASH,
      });
    });

    it('decodes u256 amount with high part', () => {
      const result = decoder.decode([makeCairo0Event(ALICE, BOB, '0x5', '0x2')]);

      expect(result[0]!.amount).toBe((5n + (2n << 128n)).toString());
    });

    it('normalizes addresses to lowercase padded hex', () => {
      const result = decoder.decode([makeCairo0Event('0xABC', '0xDEF')]);

      expect(result[0]!.from).toBe('0x' + '0'.repeat(61) + 'abc');
      expect(result[0]!.to).toBe('0x' + '0'.repeat(61) + 'def');
    });

    it('decodes real mainnet WBTC event (from Atomiq swap)', () => {
      const event: Event = {
        filterIds: [0],
        address: '0x3fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac' as `0x${string}`,
        keys: [TRANSFER_SELECTOR] as `0x${string}`[],
        data: [
          '0x4f278e1f19e495c3b1dd35ef307c4f7510768ed95481958fbae588bd173f79a',
          '0x633162ad5ea84dfd99a8e0d6792ef9fed972cdf490f08dbd2cdb5fc84306fe5',
          '0x28',
          '0x0',
        ] as `0x${string}`[],
        eventIndex: 0,
        transactionIndex: 0,
        transactionHash: '0x4959b38b2ea17df393065d7c8ef422d62759222db14b26723b075d28d215adc' as `0x${string}`,
        transactionStatus: 'succeeded',
        eventIndexInTransaction: 0,
      };

      const result = decoder.decode([event]);

      expect(result).toHaveLength(1);
      expect(result[0]!.from).toBe('0x04f278e1f19e495c3b1dd35ef307c4f7510768ed95481958fbae588bd173f79a');
      expect(result[0]!.to).toBe('0x0633162ad5ea84dfd99a8e0d6792ef9fed972cdf490f08dbd2cdb5fc84306fe5');
      expect(result[0]!.amount).toBe('40');
    });
  });

  describe('mixed formats', () => {
    it('handles Cairo 0 and Cairo 1 events together', () => {
      const result = decoder.decode([
        makeCairo1Event(ALICE, BOB),
        makeCairo0Event(BOB, ALICE),
      ]);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({from: ALICE, to: BOB, amount: '4096', txHash: TX_HASH});
      expect(result[1]).toEqual({from: BOB, to: ALICE, amount: '4096', txHash: TX_HASH});
    });
  });

  it('returns empty for empty input', () => {
    expect(decoder.decode([])).toEqual([]);
  });
});
