import {StarknetAddress} from '@bim/domain/account';
import type {NotificationGateway, NotificationMessage, StarknetGateway} from '@bim/domain/ports';
import type {StarknetConfig} from '@bim/domain/shared';
import {createLogger} from '@bim/lib/logger';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {BalanceMonitor, type BalanceMonitorConfig} from '../src';

const AVNU_ADDRESS = StarknetAddress.of('0x0000000000000000000000000000000000000000000000000000000000000aaa');
const TREASURY_ADDRESS = StarknetAddress.of('0x0000000000000000000000000000000000000000000000000000000000000bbb');
const STRK_TOKEN = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';

const ABOVE_AVNU_THRESHOLD = 10_000_000_000_000_000_000n;
const BELOW_AVNU_THRESHOLD = 1_000_000_000_000_000_000n;
const ABOVE_TREASURY_THRESHOLD = 20_000_000_000_000_000_000n;
const BELOW_TREASURY_THRESHOLD = 2_000_000_000_000_000_000n;

function createMockStarknetGateway(): StarknetGateway {
  return {
    getBalance: vi.fn().mockResolvedValue(ABOVE_AVNU_THRESHOLD),
    calculateAccountAddress: vi.fn(),
    buildDeployTransaction: vi.fn(),
    waitForTransaction: vi.fn(),
    isDeployed: vi.fn(),
    getNonce: vi.fn(),
    estimateFee: vi.fn(),
    buildCalls: vi.fn(),
    executeSignedCalls: vi.fn(),
  } as unknown as StarknetGateway;
}

function createMockNotificationGateway(): NotificationGateway {
  return {
    send: vi.fn().mockResolvedValue(undefined),
  };
}

function createStarknetConfig(): StarknetConfig {
  return {
    network: 'testnet',
    bitcoinNetwork: 'testnet',
    rpcUrl: 'http://localhost:5050',
    accountClassHash: '0x123',
    wbtcTokenAddress: StarknetAddress.of('0x0000000000000000000000000000000000000000000000000000000000000456'),
    strkTokenAddress: StarknetAddress.of(STRK_TOKEN),
    feeTreasuryAddress: TREASURY_ADDRESS,
  };
}

function createMonitorConfig(): BalanceMonitorConfig {
  return {avnuAddress: AVNU_ADDRESS};
}

describe('BalanceMonitor', () => {
  let monitor: BalanceMonitor;
  let starknetGateway: StarknetGateway;
  let notificationGateway: NotificationGateway;

  beforeEach(() => {
    starknetGateway = createMockStarknetGateway();
    notificationGateway = createMockNotificationGateway();
    monitor = new BalanceMonitor(
      starknetGateway,
      notificationGateway,
      createStarknetConfig(),
      createMonitorConfig(),
      createLogger(),
    );
  });

  describe('runIteration', () => {
    it('does not send alerts when balances are above thresholds', async () => {
      vi.mocked(starknetGateway.getBalance).mockResolvedValue(ABOVE_AVNU_THRESHOLD);

      await monitor.runIteration();

      expect(notificationGateway.send).not.toHaveBeenCalled();
    });

    it('sends AVNU alert when balance is below threshold', async () => {
      vi.mocked(starknetGateway.getBalance)
        .mockResolvedValueOnce(BELOW_AVNU_THRESHOLD)
        .mockResolvedValueOnce(ABOVE_TREASURY_THRESHOLD);

      await monitor.runIteration();

      expect(notificationGateway.send).toHaveBeenCalledOnce();
      const message = vi.mocked(notificationGateway.send).mock.calls[0]![0] as NotificationMessage;
      expect(message.title).toBe('AVNU Balance Low');
      expect(message.severity).toBe('alert');
    });

    it('sends treasury alert when balance is below threshold', async () => {
      vi.mocked(starknetGateway.getBalance)
        .mockResolvedValueOnce(ABOVE_AVNU_THRESHOLD)
        .mockResolvedValueOnce(BELOW_TREASURY_THRESHOLD);

      await monitor.runIteration();

      expect(notificationGateway.send).toHaveBeenCalledOnce();
      const message = vi.mocked(notificationGateway.send).mock.calls[0]![0] as NotificationMessage;
      expect(message.title).toBe('Treasury Balance Low');
      expect(message.severity).toBe('alert');
    });

    it('sends both alerts when both balances are below thresholds', async () => {
      vi.mocked(starknetGateway.getBalance)
        .mockResolvedValueOnce(BELOW_AVNU_THRESHOLD)
        .mockResolvedValueOnce(BELOW_TREASURY_THRESHOLD);

      await monitor.runIteration();

      expect(notificationGateway.send).toHaveBeenCalledTimes(2);
      const titles = vi.mocked(notificationGateway.send).mock.calls
        .map(call => (call[0] as NotificationMessage).title);
      expect(titles).toContain('AVNU Balance Low');
      expect(titles).toContain('Treasury Balance Low');
    });

    it('detects AVNU credits recharge between iterations', async () => {
      // First iteration: low balance
      vi.mocked(starknetGateway.getBalance)
        .mockResolvedValueOnce(BELOW_AVNU_THRESHOLD)
        .mockResolvedValueOnce(ABOVE_TREASURY_THRESHOLD);

      await monitor.runIteration();
      vi.mocked(notificationGateway.send).mockClear();

      // Second iteration: balance increased
      vi.mocked(starknetGateway.getBalance)
        .mockResolvedValueOnce(ABOVE_AVNU_THRESHOLD)
        .mockResolvedValueOnce(ABOVE_TREASURY_THRESHOLD);

      await monitor.runIteration();

      expect(notificationGateway.send).toHaveBeenCalledOnce();
      const message = vi.mocked(notificationGateway.send).mock.calls[0]![0] as NotificationMessage;
      expect(message.title).toBe('AVNU Credits Recharged');
      expect(message.severity).toBe('info');
    });

    it('does not detect recharge when balance stays the same', async () => {
      vi.mocked(starknetGateway.getBalance).mockResolvedValue(ABOVE_AVNU_THRESHOLD);

      await monitor.runIteration();
      vi.mocked(notificationGateway.send).mockClear();

      await monitor.runIteration();

      expect(notificationGateway.send).not.toHaveBeenCalled();
    });

    it('continues with treasury check when AVNU check fails', async () => {
      vi.mocked(starknetGateway.getBalance)
        .mockRejectedValueOnce(new Error('RPC timeout'))
        .mockResolvedValueOnce(BELOW_TREASURY_THRESHOLD);

      await monitor.runIteration();

      expect(notificationGateway.send).toHaveBeenCalledOnce();
      const message = vi.mocked(notificationGateway.send).mock.calls[0]![0] as NotificationMessage;
      expect(message.title).toBe('Treasury Balance Low');
    });

    it('handles treasury check failure gracefully', async () => {
      vi.mocked(starknetGateway.getBalance)
        .mockResolvedValueOnce(BELOW_AVNU_THRESHOLD)
        .mockRejectedValueOnce(new Error('RPC timeout'));

      await monitor.runIteration();

      expect(notificationGateway.send).toHaveBeenCalledOnce();
      const message = vi.mocked(notificationGateway.send).mock.calls[0]![0] as NotificationMessage;
      expect(message.title).toBe('AVNU Balance Low');
    });
  });

  describe('start / stop', () => {
    it('starts and stops without errors', () => {
      expect(() => {
        monitor.start();
        monitor.stop();
      }).not.toThrow();
    });

    it('does not start twice', () => {
      expect(() => {
        monitor.start();
        monitor.start(); // no-op
        monitor.stop();
      }).not.toThrow();
    });

    it('stop is safe to call when not started', () => {
      expect(() => monitor.stop()).not.toThrow();
    });
  });
});
