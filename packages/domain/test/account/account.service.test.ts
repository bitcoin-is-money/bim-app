import {
  AccountAlreadyExistsError,
  AccountId,
  AccountNotFoundError,
  AccountService,
  InvalidAccountStateError,
  StarknetAddress,
} from '@bim/domain/account';
import type {AccountRepository, PaymasterGateway, StarknetGateway} from '@bim/domain/ports';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {createAccount, createAccountRepoMock} from "../helper";

describe('AccountService', () => {
  const accountId = AccountId.of('550e8400-e29b-41d4-a716-446655440000');
  const starknetAddress = StarknetAddress.of('0x0' + '1'.repeat(63));

  let mockAccountRepo: AccountRepository;
  let mockStarknetGateway: StarknetGateway;
  let mockPaymasterGateway: PaymasterGateway;
  let service: AccountService;

  beforeEach(() => {
    mockAccountRepo = createAccountRepoMock();
    mockStarknetGateway = {
      calculateAccountAddress: vi.fn().mockResolvedValue(starknetAddress),
      buildDeployTransaction: vi.fn().mockResolvedValue({calls: []}),
      waitForTransaction: vi.fn().mockResolvedValue(undefined),
      getBalance: vi.fn().mockResolvedValue(BigInt(1000)),
    } as unknown as StarknetGateway;
    mockPaymasterGateway = {
      executeTransaction: vi.fn().mockResolvedValue({txHash: '0xtxhash'}),
    } as unknown as PaymasterGateway;

    service = new AccountService({
      accountRepository: mockAccountRepo,
      starknetGateway: mockStarknetGateway,
      paymasterGateway: mockPaymasterGateway,
    });
  });

  describe('create', () => {
    it('creates new account', async () => {
      vi.mocked(mockAccountRepo.existsByUsername).mockResolvedValue(false);

      const result = await service.create({
        accountId,
        username: 'testUser',
        credentialId: 'credential123',
        publicKey: '0x' + '1'.repeat(64),
      });

      expect(result.id).toBe(accountId);
      expect(result.username).toBe('testUser');
      expect(result.getStatus()).toBe('pending');
      expect(mockAccountRepo.save).toHaveBeenCalled();
    });

    it('throws if username already exists', async () => {
      vi.mocked(mockAccountRepo.existsByUsername).mockResolvedValue(true);

      expect(
        service.create({
          accountId,
          username: 'testUser',
          credentialId: 'credential123',
          publicKey: '0x' + '1'.repeat(64),
        }),
      ).rejects.toThrow(AccountAlreadyExistsError);
    });
  });

  describe('deploy', () => {
    it('deploys pending account', async () => {
      const account = createAccount('pending', accountId, starknetAddress);
      vi.mocked(mockAccountRepo.findById).mockResolvedValue(account);
      // Make waitForTransaction never resolve during test to keep status as 'deploying'
      vi.mocked(mockStarknetGateway.waitForTransaction).mockReturnValue(new Promise(() => {}));

      const result = await service.deploy({accountId, sync: false});

      expect(result.txHash).toBe('0xtxhash');
      expect(result.account.getStatus()).toBe('deploying');
      expect(mockPaymasterGateway.executeTransaction).toHaveBeenCalled();
    });

    it('throws if account not found', async () => {
      vi.mocked(mockAccountRepo.findById).mockResolvedValue(undefined);

      expect(
        service.deploy({accountId}),
      ).rejects.toThrow(AccountNotFoundError);
    });

    it('throws if account not in pending status', async () => {
      const account = createAccount('deployed');
      vi.mocked(mockAccountRepo.findById).mockResolvedValue(account);

      expect(
        service.deploy({accountId}),
      ).rejects.toThrow(InvalidAccountStateError);
    });
  });

  describe('getBalance', () => {
    it('returns balance for deployed account', async () => {
      const account = createAccount('deployed');
      vi.mocked(mockAccountRepo.findById).mockResolvedValue(account);
      vi.mocked(mockStarknetGateway.getBalance).mockResolvedValue(BigInt(5000));

      const result = await service.getBalance({accountId: accountId});

      expect(result.wbtcBalance.amount).toBe('5000');
      expect(mockStarknetGateway.getBalance).toHaveBeenCalled();
    });

    it('returns zero balance for pending account', async () => {
      const account = createAccount('pending');
      vi.mocked(mockAccountRepo.findById).mockResolvedValue(account);

      const result = await service.getBalance({accountId: accountId});

      expect(result.wbtcBalance.amount).toBe('0');
      expect(mockStarknetGateway.getBalance).not.toHaveBeenCalled();
    });

    it('throws if account not found', async () => {
      vi.mocked(mockAccountRepo.findById).mockResolvedValue(undefined);

      expect(
        service.getBalance({accountId: accountId}),
      ).rejects.toThrow(AccountNotFoundError);
    });

    it('returns zero if gateway call fails', async () => {
      const account = createAccount('deployed');
      vi.mocked(mockAccountRepo.findById).mockResolvedValue(account);
      vi.mocked(mockStarknetGateway.getBalance).mockRejectedValue(new Error('Network error'));

      const result = await service.getBalance({accountId: accountId});

      expect(result.wbtcBalance.amount).toBe('0');
    });
  });
});
