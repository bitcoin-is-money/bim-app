import {StarknetAddress} from '@bim/domain/account';
import type {PaymentBuildData, PreparedCalls} from '@bim/domain/payment';
import {PaymentBuildCache} from '@bim/domain/payment';
import {Amount} from '@bim/domain/shared';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const SENDER_ADDRESS = StarknetAddress.of('0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
const TREASURY_ADDRESS = StarknetAddress.of('0x027367ddd36d7efc4694e1af5742f8d26626369c07abf15d136ff422b9a40fa0');
const TOKEN_ADDRESS = StarknetAddress.of('0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7');

function createBuildData(overrides?: Partial<PaymentBuildData>): PaymentBuildData {
  const preparedCalls: PreparedCalls = {
    network: 'starknet',
    calls: [{contractAddress: TOKEN_ADDRESS.toString(), entrypoint: 'transfer', calldata: [TREASURY_ADDRESS.toString(), '1000', '0']}],
    amount: Amount.ofSatoshi(1000n),
    feeAmount: Amount.zero(),
    recipientAddress: TREASURY_ADDRESS,
    tokenAddress: TOKEN_ADDRESS,
  };

  return {
    preparedCalls,
    typedData: {some: 'typed-data'},
    senderAddress: SENDER_ADDRESS,
    accountId: 'account-123',
    description: 'Test payment',
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('PaymentBuildCache', () => {
  let cache: PaymentBuildCache;

  beforeEach(() => {
    cache = new PaymentBuildCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('set and consume', () => {
    it('stores and retrieves a build entry', () => {
      const data = createBuildData();
      cache.set('build-1', data);

      const result = cache.consume('build-1');

      expect(result).toEqual(data);
    });

    it('returns null for unknown id', () => {
      expect(cache.consume('unknown')).toBeNull();
    });

    it('is single-use — second consume returns null', () => {
      cache.set('build-1', createBuildData());

      cache.consume('build-1');
      const second = cache.consume('build-1');

      expect(second).toBeNull();
    });
  });

  describe('TTL expiry', () => {
    it('returns null when entry has expired', () => {
      cache.set('build-1', createBuildData());

      vi.advanceTimersByTime(5 * 60 * 1000 + 1);

      expect(cache.consume('build-1')).toBeNull();
    });

    it('returns entry just before expiry', () => {
      cache.set('build-1', createBuildData());

      vi.advanceTimersByTime(5 * 60 * 1000 - 1);

      expect(cache.consume('build-1')).not.toBeNull();
    });
  });

  describe('cleanup on set', () => {
    it('removes expired entries when a new one is added', () => {
      cache.set('old', createBuildData());

      vi.advanceTimersByTime(5 * 60 * 1000 + 1);

      cache.set('new', createBuildData());

      expect(cache.consume('old')).toBeNull();
      expect(cache.consume('new')).not.toBeNull();
    });
  });

  describe('isDonation flag', () => {
    it('preserves isDonation when set to true', () => {
      cache.set('donation-1', createBuildData({isDonation: true}));

      const result = cache.consume('donation-1');

      expect(result?.isDonation).toBe(true);
    });

    it('isDonation is undefined by default', () => {
      cache.set('payment-1', createBuildData());

      const result = cache.consume('payment-1');

      expect(result?.isDonation).toBeUndefined();
    });
  });
});
