import {StarknetAddress} from '@bim/domain/account';
import type {NotificationGateway, NotificationMessage, PaymasterGateway, StarknetGateway} from '@bim/domain/ports';
import type {StarknetConfig} from '@bim/domain/shared';
import {createLogger} from '@bim/lib/logger';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {BalanceMonitoring, type BalanceMonitoringConfig} from '../../../../src/monitoring/balance.monitoring';

const TREASURY_ADDRESS = StarknetAddress.of('0x0000000000000000000000000000000000000000000000000000000000000bbb');
const STRK_TOKEN = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';

// Default thresholds: 15 STRK for AVNU, 100 STRK + 10_000 sats for treasury
const ABOVE_AVNU_THRESHOLD = 20_000_000_000_000_000_000n;
const BELOW_AVNU_THRESHOLD = 1_000_000_000_000_000_000n;
const ABOVE_TREASURY_STRK_THRESHOLD = 300_000_000_000_000_000_000n;
const BELOW_TREASURY_STRK_THRESHOLD = 50_000_000_000_000_000_000n;
const ABOVE_TREASURY_WBTC_THRESHOLD = 100_000n;
const BELOW_TREASURY_WBTC_THRESHOLD = 1_000n;

interface MockedBalances {
  strk: bigint;
  wbtc: bigint;
}

function createMockStarknetGateway(balances: MockedBalances = {
  strk: ABOVE_TREASURY_STRK_THRESHOLD,
  wbtc: ABOVE_TREASURY_WBTC_THRESHOLD,
}): StarknetGateway {
  const getBalance = vi.fn(
    ({token}: {token: string}) => Promise.resolve(token === 'STRK' ? balances.strk : balances.wbtc),
  );
  return {
    getBalance,
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

function mockBalances(gateway: StarknetGateway, balances: MockedBalances): void {
  vi.mocked(gateway.getBalance).mockImplementation(
    ({token}: {address: StarknetAddress; token: string}) =>
      Promise.resolve(token === 'STRK' ? balances.strk : balances.wbtc),
  );
}

function createMockPaymasterGateway(): PaymasterGateway {
  return {
    getRemainingCredits: vi.fn().mockResolvedValue(ABOVE_AVNU_THRESHOLD),
    executeTransaction: vi.fn(),
    buildInvokeTransaction: vi.fn(),
    executeInvokeTransaction: vi.fn(),
    buildPaymasterTransaction: vi.fn(),
    isAvailable: vi.fn(),
    getSponsoredGasLimit: vi.fn(),
  } as unknown as PaymasterGateway;
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

function createMonitoringConfig(): BalanceMonitoringConfig {
  return {};
}

describe('BalanceMonitoring', () => {
  let starknetGateway: StarknetGateway;
  let paymasterGateway: PaymasterGateway;
  let notificationGateway: NotificationGateway;
  let monitoring: BalanceMonitoring;
  const logger = createLogger();

  beforeEach(() => {
    starknetGateway = createMockStarknetGateway();
    paymasterGateway = createMockPaymasterGateway();
    notificationGateway = createMockNotificationGateway();
    monitoring = new BalanceMonitoring(
      starknetGateway,
      paymasterGateway,
      notificationGateway,
      createStarknetConfig(),
      createMonitoringConfig(),
      logger,
    );
  });

  it('does not send alerts when balances are above thresholds', async () => {
    vi.mocked(paymasterGateway.getRemainingCredits).mockResolvedValue(ABOVE_AVNU_THRESHOLD);
    mockBalances(starknetGateway, {strk: ABOVE_TREASURY_STRK_THRESHOLD, wbtc: ABOVE_TREASURY_WBTC_THRESHOLD});

    await monitoring.run();

    expect(notificationGateway.send).not.toHaveBeenCalled();
  });

  it('sends AVNU alert when credits are below threshold', async () => {
    vi.mocked(paymasterGateway.getRemainingCredits).mockResolvedValue(BELOW_AVNU_THRESHOLD);
    mockBalances(starknetGateway, {strk: ABOVE_TREASURY_STRK_THRESHOLD, wbtc: ABOVE_TREASURY_WBTC_THRESHOLD});

    await monitoring.run();

    expect(notificationGateway.send).toHaveBeenCalledOnce();
    const message = vi.mocked(notificationGateway.send).mock.calls[0]![0];
    expect(message.title).toBe('AVNU Credits Low');
    expect(message.severity).toBe('alert');
  });

  it('sends treasury alert when STRK balance is below threshold', async () => {
    vi.mocked(paymasterGateway.getRemainingCredits).mockResolvedValue(ABOVE_AVNU_THRESHOLD);
    mockBalances(starknetGateway, {strk: BELOW_TREASURY_STRK_THRESHOLD, wbtc: ABOVE_TREASURY_WBTC_THRESHOLD});

    await monitoring.run();

    expect(notificationGateway.send).toHaveBeenCalledOnce();
    const message = vi.mocked(notificationGateway.send).mock.calls[0]![0];
    expect(message.title).toBe('Treasury Balance Low');
    expect(message.severity).toBe('alert');
    expect(message.description).toContain('STRK');
    expect(message.description).not.toContain('WBTC');
  });

  it('sends treasury alert when WBTC balance is below threshold', async () => {
    vi.mocked(paymasterGateway.getRemainingCredits).mockResolvedValue(ABOVE_AVNU_THRESHOLD);
    mockBalances(starknetGateway, {strk: ABOVE_TREASURY_STRK_THRESHOLD, wbtc: BELOW_TREASURY_WBTC_THRESHOLD});

    await monitoring.run();

    expect(notificationGateway.send).toHaveBeenCalledOnce();
    const message = vi.mocked(notificationGateway.send).mock.calls[0]![0];
    expect(message.title).toBe('Treasury Balance Low');
    expect(message.description).toContain('WBTC');
  });

  it('sends both alerts when AVNU and treasury are below thresholds', async () => {
    vi.mocked(paymasterGateway.getRemainingCredits).mockResolvedValue(BELOW_AVNU_THRESHOLD);
    mockBalances(starknetGateway, {strk: BELOW_TREASURY_STRK_THRESHOLD, wbtc: BELOW_TREASURY_WBTC_THRESHOLD});

    await monitoring.run();

    expect(notificationGateway.send).toHaveBeenCalledTimes(2);
    const titles = vi.mocked(notificationGateway.send).mock.calls
      .map(call => (call[0]).title);
    expect(titles).toContain('AVNU Credits Low');
    expect(titles).toContain('Treasury Balance Low');
  });

  it('continues with treasury check when AVNU check fails', async () => {
    vi.mocked(paymasterGateway.getRemainingCredits).mockRejectedValue(new Error('AVNU API timeout'));
    mockBalances(starknetGateway, {strk: BELOW_TREASURY_STRK_THRESHOLD, wbtc: ABOVE_TREASURY_WBTC_THRESHOLD});

    await monitoring.run();

    expect(notificationGateway.send).toHaveBeenCalledOnce();
    const message = vi.mocked(notificationGateway.send).mock.calls[0]![0];
    expect(message.title).toBe('Treasury Balance Low');
  });

  it('still alerts on STRK when WBTC balance fetch fails', async () => {
    vi.mocked(paymasterGateway.getRemainingCredits).mockResolvedValue(ABOVE_AVNU_THRESHOLD);
    vi.mocked(starknetGateway.getBalance).mockImplementation(
      ({token}: {address: StarknetAddress; token: string}) =>
        token === 'STRK'
          ? Promise.resolve(BELOW_TREASURY_STRK_THRESHOLD)
          : Promise.reject(new Error('RPC timeout')),
    );

    await monitoring.run();

    expect(notificationGateway.send).toHaveBeenCalledOnce();
    const message = vi.mocked(notificationGateway.send).mock.calls[0]![0];
    expect(message.title).toBe('Treasury Balance Low');
  });

  it('handles treasury STRK check failure gracefully', async () => {
    vi.mocked(paymasterGateway.getRemainingCredits).mockResolvedValue(BELOW_AVNU_THRESHOLD);
    vi.mocked(starknetGateway.getBalance).mockRejectedValue(new Error('RPC timeout'));

    await monitoring.run();

    expect(notificationGateway.send).toHaveBeenCalledOnce();
    const message = vi.mocked(notificationGateway.send).mock.calls[0]![0];
    expect(message.title).toBe('AVNU Credits Low');
  });
});
