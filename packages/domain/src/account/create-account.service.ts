import type {AccountRepository, StarknetGateway} from '../ports';
import {Account} from './account';
import {AccountAlreadyExistsError, AccountId, CredentialId, StarknetAddress,} from './types';

export interface CreateAccountDeps {
  accountRepository: AccountRepository;
  starknetGateway: StarknetGateway;
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
 * Creates a new account with WebAuthn credentials and computes its Starknet address.
 * The account is created in 'pending' status, ready for deployment.
 */
export function getCreateAccountService(deps: CreateAccountDeps): CreateAccountService {
  return async (input: CreateAccountInput): Promise<Account> => {
    // Ensure username uniqueness
    const exists = await deps.accountRepository.existsByUsername(input.username);
    if (exists) {
      throw new AccountAlreadyExistsError(input.username);
    }

    // Compute a deterministic Starknet address from the public key
    const starknetAddress = await deps.starknetGateway.calculateAccountAddress({
      publicKey: input.publicKey,
    });

    const account = Account.create({
      id: input.accountId,
      username: input.username,
      starknetAddress: starknetAddress,
      credentialId: CredentialId.of(input.credentialId),
      publicKey: input.publicKey,
      credentialPublicKey: input.credentialPublicKey,
    });

    await deps.accountRepository.save(account);

    return account;
  };
}
