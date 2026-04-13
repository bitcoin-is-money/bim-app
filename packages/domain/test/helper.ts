import {Account, AccountId, type AccountStatus, CredentialId, StarknetAddress} from "@bim/domain/account";
import {vi} from "vitest";
import type {AccountRepository, ChallengeRepository, SessionRepository, TransactionManager, WebAuthnGateway} from "../src/ports";

export function createAccountRepoMock(): AccountRepository {
  return {
    save: vi.fn(),
    findById: vi.fn(),
    findByCredentialId: vi.fn(),
    findByStarknetAddress: vi.fn(),
    findByUsername: vi.fn(),
    existsByUsername: vi.fn(),
    countAll: vi.fn(),
    countCreatedSince: vi.fn(),
    markAsDeploying: vi.fn(),
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
  }
}

export function createChallengeRepoMock(): ChallengeRepository {
  return {
    save: vi.fn(),
    findById: vi.fn(),
    consumeById: vi.fn(),
    findByChallenge: vi.fn(),
    delete: vi.fn(),
  }
}

export function createWebAuthnGatewayMock(): WebAuthnGateway {
  return {
    verifyRegistration: vi.fn(),
    verifyAuthentication: vi.fn(),
  }
}

export function createTransactionManagerMock(): TransactionManager {
  return {
    // Pass-through: just await the function inline (no real transaction in unit tests)
    execute: vi.fn(async (fn: () => Promise<unknown>) => fn()) as TransactionManager['execute'],
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
