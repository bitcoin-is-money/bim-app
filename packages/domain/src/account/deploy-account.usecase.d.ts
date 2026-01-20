import type { AccountRepository } from '../ports/account.repository';
import type { PaymasterGateway } from '../ports/paymaster.gateway';
import type { StarknetGateway } from '../ports/starknet.gateway';
import { Account } from './account';
import { AccountId } from './types';
export interface DeployAccountDeps {
    accountRepository: AccountRepository;
    starknetGateway: StarknetGateway;
    paymasterGateway: PaymasterGateway;
}
export interface DeployAccountInput {
    accountId: AccountId;
}
export interface DeployAccountOutput {
    account: Account;
    txHash: string;
}
export type DeployAccountUseCase = (input: DeployAccountInput) => Promise<DeployAccountOutput>;
/**
 * Deploys an account's smart contract to Starknet via the AVNU paymaster (gasless).
 * Transitions the account from 'pending' → 'deploying' → 'deployed' (or 'failed').
 */
export declare function getDeployAccountUseCase(deps: DeployAccountDeps): DeployAccountUseCase;
//# sourceMappingURL=deploy-account.usecase.d.ts.map