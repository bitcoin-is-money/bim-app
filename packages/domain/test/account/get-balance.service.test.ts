import {
  Account,
  AccountId,
  CredentialId,
  type GetBalanceOutput,
  getGetBalanceService,
  StarknetAddress
} from '@bim/domain/account';
import {AccountNotFoundError} from '@bim/domain/account';
import type {AccountRepository, StarknetGateway} from '@bim/domain/ports';
import {beforeEach, describe, expect, it, vi} from 'vitest';

describe('GetBalanceService', () => {
  const accountId = AccountId.of('550e8400-e29b-41d4-a716-446655440000');
  const starknetAddress = StarknetAddress.of('0x123');

  let mockAccountRepo: AccountRepository;
  let mockStarknetGateway: StarknetGateway;

  const createAccount = (status: 'pending' | 'deployed'): Account => {
    const account = Account.create({
      id: accountId,
      username: 'alice',
      credentialId: CredentialId.of('test-cred'),
      publicKey: '0xpubkey',
    });

    if (status === 'deployed') {
      account.markAsDeploying(starknetAddress, '0xtx');
      account.markAsDeployed();
    }

    return account;
  };

  beforeEach(() => {
    mockAccountRepo = {
      save: vi.fn(),
      findById: vi.fn(),
      findByCredentialId: vi.fn(),
      findByUsername: vi.fn(),
      existsByUsername: vi.fn(),
      delete: vi.fn()
    };

    mockStarknetGateway = {
      calculateAccountAddress: vi.fn(),
      buildDeployTransaction: vi.fn(),
      waitForTransaction: vi.fn(),
      getNonce: vi.fn(),
      getBalance: vi.fn(),
      estimateFee: vi.fn(),
    };
  });

  it('returns zero balances when account is not deployed', async () => {
    const account = createAccount('pending');
    vi.mocked(mockAccountRepo.findById).mockResolvedValue(account);

    const getBalance = getGetBalanceService({
      accountRepository: mockAccountRepo,
      starknetGateway: mockStarknetGateway,
    });

    const result: GetBalanceOutput = await getBalance({accountId});

    expect(result).toEqual({
      wbtcBalance: {
        symbol: 'WBTC',
        amount: '0',
        decimals: 8,
      },
    });
    expect(mockStarknetGateway.getBalance).not.toHaveBeenCalled();
  });

  it('fetches WBTC balance when account is deployed', async () => {
    const account = createAccount('deployed');
    vi.mocked(mockAccountRepo.findById).mockResolvedValue(account);
    vi.mocked(mockStarknetGateway.getBalance)
      .mockResolvedValueOnce(125050000n);

    const getBalance = getGetBalanceService({
      accountRepository: mockAccountRepo,
      starknetGateway: mockStarknetGateway,
    });

    const result = await getBalance({accountId});

    expect(result.wbtcBalance).toEqual({
      symbol: 'WBTC',
      amount: '125050000',
      decimals: 8
    });

    expect(mockStarknetGateway.getBalance).toHaveBeenCalledTimes(1);
  });

  it('throws AccountNotFoundError when account does not exist', async () => {
    vi.mocked(mockAccountRepo.findById).mockResolvedValue(undefined);

    const getBalance = getGetBalanceService({
      accountRepository: mockAccountRepo,
      starknetGateway: mockStarknetGateway,
    });

    expect(getBalance({accountId})).rejects.toThrow(AccountNotFoundError);
  });

  it('returns zero when gateway call fails', async () => {
    const account = createAccount('deployed');
    vi.mocked(mockAccountRepo.findById).mockResolvedValue(account);
    vi.mocked(mockStarknetGateway.getBalance)
      .mockRejectedValueOnce(new Error('RPC error'));

    const getBalance = getGetBalanceService({
      accountRepository: mockAccountRepo,
      starknetGateway: mockStarknetGateway,
    });

    const result = await getBalance({accountId});

    expect(result.wbtcBalance).toEqual({
      symbol: 'WBTC',
      amount: '0',
      decimals: 8
    });
  });
});
