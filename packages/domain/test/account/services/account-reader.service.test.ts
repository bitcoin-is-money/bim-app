import {
  AccountId,
  AccountNotFoundError,
  AccountReader,
  StarknetAddress,
} from '@bim/domain/account';
import type {AccountRepository, StarknetGateway} from '@bim/domain/ports';
import {createLogger} from '@bim/lib/logger';
import type {Logger} from 'pino';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {createAccount, createAccountRepoMock} from '../../helper';

const LOG_LEVEL = 'debug';
const logger: Logger = createLogger(LOG_LEVEL);

describe('AccountReader', () => {
  const accountId = AccountId.of('550e8400-e29b-41d4-a716-446655440000');
  const starknetAddress = StarknetAddress.of('0x0' + '1'.repeat(63));

  let mockAccountRepo: AccountRepository;
  let mockStarknetGateway: StarknetGateway;
  let service: AccountReader;

  beforeEach(() => {
    mockAccountRepo = createAccountRepoMock();
    mockStarknetGateway = {
      calculateAccountAddress: vi.fn().mockReturnValue(starknetAddress),
      getBalance: vi.fn().mockResolvedValue(BigInt(1000)),
    } as unknown as StarknetGateway;

    service = new AccountReader({
      accountRepository: mockAccountRepo,
      starknetGateway: mockStarknetGateway,
      logger,
    });
  });

  describe('getBalance', () => {
    it('returns balance for deployed account', async () => {
      const account = createAccount('deployed');
      vi.mocked(mockAccountRepo.findById).mockResolvedValue(account);
      vi.mocked(mockStarknetGateway.getBalance).mockResolvedValue(BigInt(5000));

      const result = await service.getBalance({accountId});

      expect(result.wbtcBalance.amount).toBe('5000');
      expect(mockStarknetGateway.getBalance).toHaveBeenCalled();
    });

    it('returns zero balance for pending account', async () => {
      const account = createAccount('pending');
      vi.mocked(mockAccountRepo.findById).mockResolvedValue(account);

      const result = await service.getBalance({accountId});

      expect(result.wbtcBalance.amount).toBe('0');
      expect(mockStarknetGateway.getBalance).not.toHaveBeenCalled();
    });

    it('throws if account not found', async () => {
      vi.mocked(mockAccountRepo.findById).mockResolvedValue(undefined);

      await expect(
        service.getBalance({accountId}),
      ).rejects.toThrow(AccountNotFoundError);
    });

    it('returns zero if gateway call fails', async () => {
      const account = createAccount('deployed');
      vi.mocked(mockAccountRepo.findById).mockResolvedValue(account);
      vi.mocked(mockStarknetGateway.getBalance).mockRejectedValue(new Error('Network error'));

      const result = await service.getBalance({accountId});

      expect(result.wbtcBalance.amount).toBe('0');
    });
  });

  describe('getDeploymentStatus', () => {
    it('returns status=pending and no txHash for a freshly created account', async () => {
      const account = createAccount('pending', accountId, starknetAddress);
      vi.mocked(mockAccountRepo.findById).mockResolvedValue(account);

      const result = await service.getDeploymentStatus({accountId});

      expect(result.status).toBe('pending');
      expect(result.isDeployed).toBe(false);
      expect(result.txHash).toBeUndefined();
    });

    it('returns status=deployed, isDeployed=true, and the txHash for a deployed account', async () => {
      const account = createAccount('deployed', accountId, starknetAddress);
      vi.mocked(mockAccountRepo.findById).mockResolvedValue(account);

      const result = await service.getDeploymentStatus({accountId});

      expect(result.status).toBe('deployed');
      expect(result.isDeployed).toBe(true);
      expect(result.txHash).toBe('0xtx');
    });

    it('throws AccountNotFoundError when account does not exist', async () => {
      vi.mocked(mockAccountRepo.findById).mockResolvedValue(undefined);

      await expect(service.getDeploymentStatus({accountId})).rejects.toThrow(AccountNotFoundError);
    });
  });
});
