import {
  AccountAlreadyExistsError,
  AccountId,
  AccountNotFoundError,
  AccountService,
  InvalidAccountStateError,
  StarknetAddress,
} from '@bim/domain/account';
import type {AccountRepository, PaymasterGateway, StarknetGateway} from '@bim/domain/ports';
import {createLogger} from '@bim/lib/logger';
import type {Logger} from "pino";
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {createAccount, createAccountRepoMock} from "../helper";

const LOG_LEVEL = 'debug';
const logger: Logger = createLogger(LOG_LEVEL);

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
      calculateAccountAddress: vi.fn().mockReturnValue(starknetAddress),
      buildDeployTransaction: vi.fn().mockReturnValue({calls: []}),
      waitForTransaction: vi.fn().mockResolvedValue(undefined),
      isDeployed: vi.fn().mockResolvedValue(true),
      getBalance: vi.fn().mockResolvedValue(BigInt(1000)),
    } as unknown as StarknetGateway;
    mockPaymasterGateway = {
      executeTransaction: vi.fn().mockResolvedValue({txHash: '0xtxhash'}),
    } as unknown as PaymasterGateway;

    service = new AccountService({
      accountRepository: mockAccountRepo,
      starknetGateway: mockStarknetGateway,
      paymasterGateway: mockPaymasterGateway,
      logger: logger,
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

    it('throws AccountAlreadyExistsError with username when username is taken', async () => {
      vi.mocked(mockAccountRepo.existsByUsername).mockResolvedValue(true);

      const error = await service.create({
        accountId,
        username: 'testUser',
        credentialId: 'credential123',
        publicKey: '0x' + '1'.repeat(64),
      }).catch((err: unknown) => err);

      expect(error).toBeInstanceOf(AccountAlreadyExistsError);
      expect((error as AccountAlreadyExistsError).args).toEqual({username: 'testUser'});
    });
  });

  describe('deploy', () => {
    it('deploys pending account', async () => {
      const account = createAccount('pending', accountId, starknetAddress);
      vi.mocked(mockAccountRepo.findById).mockResolvedValue(account);
      vi.mocked(mockAccountRepo.markAsDeploying).mockResolvedValue(true);
      // Make waitForTransaction never resolve during test to keep status as 'deploying'
      vi.mocked(mockStarknetGateway.waitForTransaction).mockReturnValue(new Promise(() => { /* never resolves — keeps status as 'deploying' */ }));

      const result = await service.deploy({accountId});

      expect(result.txHash).toBe('0xtxhash');
      expect(result.account.getStatus()).toBe('deploying');
      expect(mockAccountRepo.markAsDeploying).toHaveBeenCalledWith(
        accountId, starknetAddress, '',
      );
      expect(mockPaymasterGateway.executeTransaction).toHaveBeenCalled();
    });

    it('throws if account not found', async () => {
      vi.mocked(mockAccountRepo.findById).mockResolvedValue(undefined);

      await expect(
        service.deploy({accountId}),
      ).rejects.toThrow(AccountNotFoundError);
    });

    it('throws InvalidAccountStateError with status and action when not in pending', async () => {
      const account = createAccount('deployed');
      vi.mocked(mockAccountRepo.findById).mockResolvedValue(account);

      const error = await service.deploy({accountId}).catch((err: unknown) => err);

      expect(error).toBeInstanceOf(InvalidAccountStateError);
      expect((error as InvalidAccountStateError).args).toEqual({status: 'deployed', action: 'deploy'});
    });

    it('throws if concurrent deployment wins the atomic lock', async () => {
      const account = createAccount('pending', accountId, starknetAddress);
      vi.mocked(mockAccountRepo.findById).mockResolvedValue(account);
      vi.mocked(mockAccountRepo.markAsDeploying).mockResolvedValue(false);

      await expect(
        service.deploy({accountId}),
      ).rejects.toThrow(InvalidAccountStateError);

      expect(mockPaymasterGateway.executeTransaction).not.toHaveBeenCalled();
    });

    describe('recoverStuckDeployment (account stuck in deploying)', () => {
      it('marks as deployed when tx confirmed on-chain', async () => {
        const account = createAccount('deploying', accountId, starknetAddress);
        vi.mocked(mockAccountRepo.findById).mockResolvedValue(account);
        vi.mocked(mockStarknetGateway.waitForTransaction).mockResolvedValue({} as never);
        vi.mocked(mockStarknetGateway.isDeployed).mockResolvedValue(true);

        const result = await service.deploy({accountId});

        expect(result.account.getStatus()).toBe('deployed');
        expect(result.txHash).toBe('0xtx');
        expect(mockPaymasterGateway.executeTransaction).not.toHaveBeenCalled();
      });

      it('marks as failed and throws when tx fails on-chain', async () => {
        const account = createAccount('deploying', accountId, starknetAddress);
        vi.mocked(mockAccountRepo.findById).mockResolvedValue(account);
        vi.mocked(mockStarknetGateway.waitForTransaction).mockRejectedValue(new Error('reverted'));

        let caught: unknown;
        try {
          await service.deploy({accountId});
        } catch (err) {
          caught = err;
        }

        expect(caught).toBeInstanceOf(InvalidAccountStateError);
        expect(account.getStatus()).toBe('failed');
        expect(mockAccountRepo.save).toHaveBeenCalledWith(account);
      });

      it('marks as failed and throws when tx confirmed but contract not deployed', async () => {
        const account = createAccount('deploying', accountId, starknetAddress);
        vi.mocked(mockAccountRepo.findById).mockResolvedValue(account);
        vi.mocked(mockStarknetGateway.waitForTransaction).mockResolvedValue({} as never);
        vi.mocked(mockStarknetGateway.isDeployed).mockResolvedValue(false);

        await expect(service.deploy({accountId})).rejects.toThrow(InvalidAccountStateError);

        expect(account.getStatus()).toBe('failed');
      });
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

      await expect(
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
