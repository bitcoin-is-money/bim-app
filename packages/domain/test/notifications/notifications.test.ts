import {StarknetAddress} from '@bim/domain/account';
import {
  AvnuBalanceLow,
  AvnuCreditsRecharged,
  NoopNotificationGateway,
  SwapClaimFailed,
  TreasuryBalanceLow,
} from '@bim/domain/notifications';
import {formatStrk, starkscanUrl, truncateAddress} from '../../src/notifications/format';
import {SwapId} from '@bim/domain/swap';
import {createLogger} from '@bim/lib/logger';
import {describe, expect, it} from 'vitest';

const ADDRESS = StarknetAddress.of('0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7');
const SWAP_ID = SwapId.of('660e8400-e29b-41d4-a716-446655440001');
const logger = createLogger('silent');

describe('notifications/format', () => {
  it('truncates addresses to 8...4 layout', () => {
    expect(truncateAddress('0x1234567890abcdef')).toBe('0x123456...cdef');
  });

  it('formats strk wei to 6 decimals', () => {
    expect(formatStrk(1_000_000_000_000_000_000n)).toBe('1.000000');
    expect(formatStrk(123_456_789_012_345_678n)).toBe('0.123456');
    expect(formatStrk(0n)).toBe('0.000000');
  });

  it('points to mainnet starkscan when network is mainnet', () => {
    expect(starkscanUrl(ADDRESS, 'mainnet')).toContain('starkscan.co');
    expect(starkscanUrl(ADDRESS, 'mainnet')).not.toContain('testnet');
  });

  it('points to testnet starkscan otherwise', () => {
    expect(starkscanUrl(ADDRESS, 'sepolia')).toContain('testnet.starkscan.co');
  });
});

describe('AvnuBalanceLow', () => {
  it('returns alert message when balance is below threshold', () => {
    const msg = AvnuBalanceLow.evaluate({
      network: 'sepolia',
      currentBalance: 5n * 10n ** 18n,
      threshold: 50n * 10n ** 18n,
    });
    expect(msg).toBeDefined();
    expect(msg?.severity).toBe('alert');
    expect(msg?.fields.get('Network')).toBe('sepolia');
  });

  it('returns undefined when balance is above threshold', () => {
    const msg = AvnuBalanceLow.evaluate({
      network: 'sepolia',
      currentBalance: 100n * 10n ** 18n,
      threshold: 50n * 10n ** 18n,
    });
    expect(msg).toBeUndefined();
  });
});

describe('AvnuCreditsRecharged', () => {
  it('returns info message when balance increased', () => {
    const msg = AvnuCreditsRecharged.evaluate({
      address: ADDRESS,
      network: 'mainnet',
      previousBalance: 10n * 10n ** 18n,
      currentBalance: 100n * 10n ** 18n,
    });
    expect(msg).toBeDefined();
    expect(msg?.severity).toBe('info');
    expect(msg?.title).toBe('AVNU Credits Recharged');
  });

  it('returns undefined when balance did not increase', () => {
    const msg = AvnuCreditsRecharged.evaluate({
      address: ADDRESS,
      network: 'mainnet',
      previousBalance: 100n * 10n ** 18n,
      currentBalance: 100n * 10n ** 18n,
    });
    expect(msg).toBeUndefined();
  });
});

describe('TreasuryBalanceLow', () => {
  it('returns alert when balance below threshold', () => {
    const msg = TreasuryBalanceLow.evaluate({
      address: ADDRESS,
      network: 'mainnet',
      currentBalance: 1n * 10n ** 18n,
      threshold: 10n * 10n ** 18n,
    });
    expect(msg).toBeDefined();
    expect(msg?.severity).toBe('alert');
    expect(msg?.title).toBe('Treasury Balance Low');
  });

  it('returns undefined when balance above threshold', () => {
    expect(
      TreasuryBalanceLow.evaluate({
        address: ADDRESS,
        network: 'mainnet',
        currentBalance: 100n * 10n ** 18n,
        threshold: 10n * 10n ** 18n,
      }),
    ).toBeUndefined();
  });
});

describe('SwapClaimFailed', () => {
  it('builds an error notification with all required fields', () => {
    const msg = SwapClaimFailed.build({
      swapId: SWAP_ID,
      userAddress: ADDRESS,
      network: 'mainnet',
      amount: '0.001 BTC',
      error: 'tx reverted',
    });
    expect(msg.severity).toBe('error');
    expect(msg.title).toBe('Swap Claim Failed');
    expect(msg.fields.get('Swap ID')).toContain(SWAP_ID);
    expect(msg.fields.get('Error')).toBe('tx reverted');
  });
});

describe('NoopNotificationGateway', () => {
  it('resolves without sending anything', async () => {
    const gateway = new NoopNotificationGateway(logger);
    await expect(
      gateway.send({
        channel: '#alerting',
        severity: 'info',
        title: 'test',
        description: 'test',
        fields: new Map(),
        links: [],
        context: 'test',
      }),
    ).resolves.toBeUndefined();
  });
});
