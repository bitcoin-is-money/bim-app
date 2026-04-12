import {createLogger} from '@bim/lib/logger';
import type {
  AccountRepository,
  NotificationGateway,
  TransactionRepository,
} from '@bim/domain/ports';
import type {StarknetConfig} from '@bim/domain/shared';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {ActivityMonitoring} from '../../../src/monitoring/activity.monitoring';

function createMockAccountRepository(): AccountRepository {
  return {
    save: vi.fn(),
    findById: vi.fn(),
    findByUsername: vi.fn(),
    findByCredentialId: vi.fn(),
    findByStarknetAddress: vi.fn(),
    existsByUsername: vi.fn(),
    countAll: vi.fn(),
    countCreatedSince: vi.fn(),
    markAsDeploying: vi.fn(),
    delete: vi.fn(),
  };
}

function createMockTransactionRepository(): TransactionRepository {
  return {
    save: vi.fn(),
    saveMany: vi.fn(),
    findById: vi.fn(),
    findByHash: vi.fn(),
    findByAccountId: vi.fn(),
    countByAccountId: vi.fn(),
    countAll: vi.fn(),
    countCreatedSince: vi.fn(),
    existsByHash: vi.fn(),
    saveDescription: vi.fn(),
    deleteDescription: vi.fn(),
  };
}

function createMockNotificationGateway(): NotificationGateway {
  return {send: vi.fn().mockResolvedValue(undefined)};
}

const starknetConfig: StarknetConfig = {
  network: 'mainnet',
  bitcoinNetwork: 'mainnet',
  rpcUrl: 'http://localhost:5050',
  accountClassHash: '0x123',
  wbtcTokenAddress: '0xwbtc',
  strkTokenAddress: '0xstrk',
  feeTreasuryAddress: '0xtreasury',
} as unknown as StarknetConfig;

describe('ActivityMonitoring', () => {
  let accountRepo: AccountRepository;
  let transactionRepo: TransactionRepository;
  let notificationGateway: NotificationGateway;
  let service: ActivityMonitoring;

  beforeEach(() => {
    accountRepo = createMockAccountRepository();
    transactionRepo = createMockTransactionRepository();
    notificationGateway = createMockNotificationGateway();
    service = new ActivityMonitoring(
      accountRepo,
      transactionRepo,
      notificationGateway,
      starknetConfig,
      createLogger(),
    );
  });

  it('queries the 4 counts and sends an activity report', async () => {
    vi.mocked(accountRepo.countAll).mockResolvedValue(1000);
    vi.mocked(accountRepo.countCreatedSince).mockResolvedValue(25);
    vi.mocked(transactionRepo.countAll).mockResolvedValue(50_000);
    vi.mocked(transactionRepo.countCreatedSince).mockResolvedValue(750);

    await service.run();

    const expectedOptions = {excludeUsernamePrefix: 'e2e_'};
    expect(accountRepo.countAll).toHaveBeenCalledWith(expectedOptions);
    expect(transactionRepo.countAll).toHaveBeenCalledWith(expectedOptions);
    expect(accountRepo.countCreatedSince).toHaveBeenCalledWith(expect.any(Date), expectedOptions);
    expect(transactionRepo.countCreatedSince).toHaveBeenCalledWith(expect.any(Date), expectedOptions);
    expect(notificationGateway.send).toHaveBeenCalledOnce();

    const sent = vi.mocked(notificationGateway.send).mock.calls[0]?.[0];
    if (!sent) throw new Error('notification gateway was not called');
    expect(sent.channel).toBe('#reporting');
    expect(sent.title).toBe('BIM Activity Report');
    expect(sent.description).toContain('New users: 25');
    expect(sent.description).toContain('New transactions: 750');
    expect(sent.description).toContain('*All time*');
    expect(sent.description).toContain('Total users: 1,000');
    expect(sent.description).toContain('Total transactions: 50,000');
  });

  it('queries new users/transactions with a date roughly 7 days ago', async () => {
    vi.mocked(accountRepo.countAll).mockResolvedValue(0);
    vi.mocked(accountRepo.countCreatedSince).mockResolvedValue(0);
    vi.mocked(transactionRepo.countAll).mockResolvedValue(0);
    vi.mocked(transactionRepo.countCreatedSince).mockResolvedValue(0);

    const now = Date.now();
    await service.run();

    const accountCall = vi.mocked(accountRepo.countCreatedSince).mock.calls[0]?.[0];
    const txCall = vi.mocked(transactionRepo.countCreatedSince).mock.calls[0]?.[0];
    expect(accountCall).toBeInstanceOf(Date);
    expect(txCall).toBeInstanceOf(Date);

    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const expectedFloor = now - sevenDaysMs - 1000;
    const expectedCeil = now - sevenDaysMs + 1000;
    expect(accountCall!.getTime()).toBeGreaterThanOrEqual(expectedFloor);
    expect(accountCall!.getTime()).toBeLessThanOrEqual(expectedCeil);
    expect(txCall!.getTime()).toBeGreaterThanOrEqual(expectedFloor);
    expect(txCall!.getTime()).toBeLessThanOrEqual(expectedCeil);
  });

  it('swallows errors so the cron route never 500s', async () => {
    vi.mocked(accountRepo.countAll).mockRejectedValue(new Error('db down'));
    vi.mocked(accountRepo.countCreatedSince).mockResolvedValue(0);
    vi.mocked(transactionRepo.countAll).mockResolvedValue(0);
    vi.mocked(transactionRepo.countCreatedSince).mockResolvedValue(0);

    await expect(service.run()).resolves.toBeUndefined();
    expect(notificationGateway.send).not.toHaveBeenCalled();
  });

  it('swallows notification gateway failures', async () => {
    vi.mocked(accountRepo.countAll).mockResolvedValue(0);
    vi.mocked(accountRepo.countCreatedSince).mockResolvedValue(0);
    vi.mocked(transactionRepo.countAll).mockResolvedValue(0);
    vi.mocked(transactionRepo.countCreatedSince).mockResolvedValue(0);
    vi.mocked(notificationGateway.send).mockRejectedValue(new Error('slack down'));

    await expect(service.run()).resolves.toBeUndefined();
  });
});
