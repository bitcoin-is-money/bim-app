import type { AccountRepository } from '../ports/account.repository';
import type { StarknetGateway } from '../ports/starknet.gateway';
import { Account } from './account';
import { StarknetAddress } from './types';
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
export declare function getCreateAccountUseCase(deps: CreateAccountDeps): CreateAccountUseCase;
//# sourceMappingURL=create-account.usecase.d.ts.map