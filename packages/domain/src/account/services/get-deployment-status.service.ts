import type {AccountRepository} from '../../ports';
import {AccountNotFoundError} from '../errors';
import type {
  GetDeploymentStatusInput,
  GetDeploymentStatusOutput,
  GetDeploymentStatusUseCase,
} from '../use-cases/get-deployment-status.use-case';

export interface GetDeploymentStatusDeps {
  accountRepository: AccountRepository;
}

/**
 * Retrieves the current deployment status of an account (fresh from DB).
 */
export class GetDeploymentStatus implements GetDeploymentStatusUseCase {
  constructor(private readonly deps: GetDeploymentStatusDeps) {}

  async execute({accountId}: GetDeploymentStatusInput): Promise<GetDeploymentStatusOutput> {
    const account = await this.deps.accountRepository.findById(accountId);
    if (!account) {
      throw new AccountNotFoundError(accountId);
    }
    return {
      status: account.getStatus(),
      txHash: account.getDeploymentTxHash(),
      isDeployed: account.isDeployed(),
    };
  }
}
