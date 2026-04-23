import {
  AccountId,
  AccountNotFoundError,
  GetDeploymentStatus,
  StarknetAddress,
} from '@bim/domain/account';
import type {AccountRepository} from '@bim/domain/ports';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {createAccount, createAccountRepoMock} from '../../helper';

describe('GetDeploymentStatus', () => {
  const accountId = AccountId.of('550e8400-e29b-41d4-a716-446655440000');
  const starknetAddress = StarknetAddress.of('0x0' + '1'.repeat(63));

  let mockAccountRepo: AccountRepository;
  let service: GetDeploymentStatus;

  beforeEach(() => {
    mockAccountRepo = createAccountRepoMock();
    service = new GetDeploymentStatus({accountRepository: mockAccountRepo});
  });

  it('returns status=pending and no txHash for a freshly created account', async () => {
    const account = createAccount('pending', accountId, starknetAddress);
    vi.mocked(mockAccountRepo.findById).mockResolvedValue(account);

    const result = await service.execute({accountId});

    expect(result.status).toBe('pending');
    expect(result.isDeployed).toBe(false);
    expect(result.txHash).toBeUndefined();
  });

  it('returns status=deployed, isDeployed=true, and the txHash for a deployed account', async () => {
    const account = createAccount('deployed', accountId, starknetAddress);
    vi.mocked(mockAccountRepo.findById).mockResolvedValue(account);

    const result = await service.execute({accountId});

    expect(result.status).toBe('deployed');
    expect(result.isDeployed).toBe(true);
    expect(result.txHash).toBe('0xtx');
  });

  it('throws AccountNotFoundError when account does not exist', async () => {
    vi.mocked(mockAccountRepo.findById).mockResolvedValue(undefined);

    await expect(service.execute({accountId})).rejects.toThrow(AccountNotFoundError);
  });
});
