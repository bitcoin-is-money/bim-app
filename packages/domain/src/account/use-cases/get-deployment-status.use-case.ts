import type {AccountId, AccountStatus} from '../types';

export interface GetDeploymentStatusInput {
  accountId: AccountId;
}

export interface GetDeploymentStatusOutput {
  status: AccountStatus;
  txHash: string | undefined;
  isDeployed: boolean;
}

/**
 * Retrieves the current deployment status of an account.
 */
export interface GetDeploymentStatusUseCase {
  execute(input: GetDeploymentStatusInput): Promise<GetDeploymentStatusOutput>;
}
