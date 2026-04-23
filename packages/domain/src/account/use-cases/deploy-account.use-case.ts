import type {Account} from '../account';
import type {AccountId} from '../types';

export interface DeployAccountInput {
  accountId: AccountId;
}

export interface DeployAccountOutput {
  account: Account;
  txHash: string;
}

/**
 * Deploys an account's smart contract to Starknet via the AVNU paymaster.
 */
export interface DeployAccountUseCase {
  execute(input: DeployAccountInput): Promise<DeployAccountOutput>;
}
