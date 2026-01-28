import type {AccountRepository} from '../ports';
import {Account} from './account';
import {AccountAlreadyExistsError, AccountId, CredentialId} from './types';

export interface CreateAccountDeps {
  accountRepository: AccountRepository;
}

export interface CreateAccountInput {
  accountId: AccountId;
  username: string;
  credentialId: string;
  publicKey: string;
  credentialPublicKey?: string;
}

export type CreateAccountService = (input: CreateAccountInput) => Promise<Account>;

/**
 * Creates a new account with WebAuthn credentials.
 * The account is created in 'pending' status, ready for deployment.
 * Starknet address will be computed during deployment.
 */
export function getCreateAccountService(deps: CreateAccountDeps): CreateAccountService {
  return async (input: CreateAccountInput): Promise<Account> => {
    // Ensure username uniqueness
    const exists = await deps.accountRepository.existsByUsername(input.username);
    if (exists) {
      throw new AccountAlreadyExistsError(input.username);
    }

    const account = Account.create({
      id: input.accountId,
      username: input.username,
      credentialId: CredentialId.of(input.credentialId),
      publicKey: input.publicKey,
      credentialPublicKey: input.credentialPublicKey,
    });

    await deps.accountRepository.save(account);

    return account;
  };
}
