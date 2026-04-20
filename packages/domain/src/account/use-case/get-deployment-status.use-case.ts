import type {AccountStatus} from '../types';

export interface GetDeploymentStatusInput {
  accountId: string;
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
  getDeploymentStatus(input: GetDeploymentStatusInput): Promise<GetDeploymentStatusOutput>;
}
