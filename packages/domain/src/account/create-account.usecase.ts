import type {AccountRepository, StarknetGateway} from '../ports';
import {Account} from './account';
import {AccountAlreadyExistsError, AccountId, CredentialId, StarknetAddress,} from './types';

export interface CreateAccountDeps {
  accountRepository: AccountRepository;
  starknetGateway: StarknetGateway;
}

export interface CreateAccountInput {
  username: string;
  credentialId: string;
  publicKey: string;
  credentialPublicKey?: string;
}

export interface CreateAccountOutput {
  account: Account;
  starknetAddress: StarknetAddress;
}

export type CreateAccountUseCase = (input: CreateAccountInput) => Promise<CreateAccountOutput>;

/**
 * Creates a new account with WebAuthn credentials and computes its Starknet address.
 * The account is created in 'pending' status, ready for deployment.
 */
export function getCreateAccountUseCase(deps: CreateAccountDeps): CreateAccountUseCase {
  return async (input: CreateAccountInput): Promise<CreateAccountOutput> => {
    // Ensure username uniqueness
    const exists = await deps.accountRepository.existsByUsername(input.username);
    if (exists) {
      throw new AccountAlreadyExistsError(input.username);
    }

    const account = Account.create({
      id: AccountId.generate(),
      username: input.username,
      credentialId: CredentialId.of(input.credentialId),
      publicKey: input.publicKey,
      credentialPublicKey: input.credentialPublicKey,
    });

    // Compute deterministic Starknet address from public key
    const starknetAddress = await deps.starknetGateway.calculateAccountAddress({
      publicKey: input.publicKey,
    });
    account.setStarknetAddress(starknetAddress);

    await deps.accountRepository.save(account);

    return { account, starknetAddress };
  };
}
