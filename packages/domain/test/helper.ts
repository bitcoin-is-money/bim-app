import {Account, AccountId, type AccountStatus, CredentialId, StarknetAddress} from "@bim/domain/account";
import type {Logger} from "pino";
import {vi} from "vitest";
import type {AccountRepository, SessionRepository} from "../src/ports";
import {createLogger} from '@bim/lib/logger';

const DEFAULT_LOG_LEVEL = 'info';

export function createTestLogger(level: string = DEFAULT_LOG_LEVEL): Logger {
  return createLogger(level);
}

export function createAccountRepoMock(): AccountRepository {
  return {
    save: vi.fn(),
    findById: vi.fn(),
    findByCredentialId: vi.fn(),
    findByUsername: vi.fn(),
    existsByUsername: vi.fn(),
    delete: vi.fn(),
  }
}

export function createSessionRepoMock(): SessionRepository {
  return {
    save: vi.fn(),
    findById: vi.fn(),
    findByAccountId: vi.fn(),
    delete: vi.fn(),
    deleteByAccountId: vi.fn(),
    deleteExpired: vi.fn(),
  }
}

export function createAccount(
  status: AccountStatus = 'pending',
  accountId: AccountId = AccountId.of('550e8400-e29b-41d4-a716-446655440000'),
  starknetAddress: StarknetAddress = StarknetAddress.of('0x0' + '1'.repeat(63)),
): Account {
  const account = Account.create({
    id: accountId,
    username: 'testUser',
    credentialId: CredentialId.of('credential123'),
    publicKey: '0x' + '1'.repeat(64),
  });
  if (status === 'deploying') {
    account.markAsDeploying(starknetAddress, '0xtx');
  } else if (status === 'deployed') {
    account.markAsDeploying(starknetAddress, '0xtx');
    account.markAsDeployed();
  } else if (status === 'failed') {
    account.markAsDeploying(starknetAddress, '0xtx');
    account.markAsFailed();
  }
  return account;
}
