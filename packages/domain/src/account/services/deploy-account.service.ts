import type {Logger} from 'pino';
import type {AccountRepository, PaymasterGateway, StarknetGateway} from '../../ports';
import type {Account} from '../account';
import {AccountNotFoundError, InvalidAccountStateError} from '../errors';
import type {
  DeployAccountInput,
  DeployAccountOutput,
  DeployAccountUseCase,
} from '../use-cases/deploy-account.use-case';

export interface DeployAccountDeps {
  accountRepository: AccountRepository;
  starknetGateway: StarknetGateway;
  paymasterGateway: PaymasterGateway;
  logger: Logger;
}

/**
 * Deploys an account's smart contract to Starknet via the AVNU paymaster (gasless).
 * Computes the Starknet address and transitions the account from
 * 'pending' -> 'deploying' -> 'deployed' (or 'failed').
 */
export class DeployAccount implements DeployAccountUseCase {
  private readonly log: Logger;

  constructor(private readonly deps: DeployAccountDeps) {
    this.log = deps.logger.child({name: 'deploy-account.service.ts'});
  }

  async execute({accountId}: DeployAccountInput): Promise<DeployAccountOutput> {
    this.log.info({accountId}, 'Deploying account');
    const account = await this.deps.accountRepository.findById(accountId);
    if (!account) {
      throw new AccountNotFoundError(accountId);
    }

    // If the account is stuck in 'deploying' (e.g., server crashed before confirmation),
    // try to resolve the pending deployment by checking the tx on-chain.
    if (account.getStatus() === 'deploying') {
      return this.recoverStuckDeployment(account);
    }

    if (!account.canDeploy()) {
      throw new InvalidAccountStateError(
        account.getStatus(),
        'deploy',
        'account must be in pending status',
      );
    }

    // Compute the deterministic Starknet address from the public key
    const starknetAddress = this.deps.starknetGateway.calculateAccountAddress({
      publicKey: account.publicKey,
    });

    const deployTx = this.deps.starknetGateway.buildDeployTransaction({
      starknetAddress,
      publicKey: account.publicKey,
    });

    // Atomic lock: pending -> deploying (before the expensive paymaster call).
    // Only one concurrent request can win this transition.
    const claimed = await this.deps.accountRepository.markAsDeploying(
      account.id, starknetAddress, '',
    );
    if (!claimed) {
      throw new InvalidAccountStateError(
        account.getStatus(),
        'deploy',
        'account is no longer in pending status (concurrent deployment)',
      );
    }

    // Execute via paymaster for gasless deployment (safe — we own the deploying state)
    this.log.info('Deploying account via paymaster');
    const {txHash} = await this.deps.paymasterGateway.executeTransaction({
      transaction: deployTx,
      accountAddress: starknetAddress,
    });

    // Sync in-memory entity state and persist the real txHash
    account.markAsDeploying(starknetAddress, txHash);
    await this.deps.accountRepository.save(account);
    this.log.info({accountId, starknetAddress, txHash}, 'Account deployment submitted');

    // @review-accepted: fire-and-forget intentional — try/catch inside waitForDeploymentConfirmation
    void this.waitForDeploymentConfirmation(account, txHash);

    return {account, txHash};
  }

  /**
   * Recovers an account stuck in 'deploying' state (e.g., after a server crash).
   * Checks the pending tx on-chain: if confirmed -> deployed, if rejected -> failed.
   *
   * Typical scenario: user registers -> calls deploy -> server crashes mid-deploy
   * -> server restarts -> user still has the same session and accountId
   * -> frontend retries POST /api/account/deploy -> this recovery kicks in.
   *
   * If the session expired during downtime, the user re-authenticates (login, not
   * register) and retrieves the same account, so recovery still works.
   */
  private async recoverStuckDeployment(account: Account): Promise<DeployAccountOutput> {
    const txHash = account.getDeploymentTxHash();
    if (!txHash) {
      // No tx was ever submitted — mark as failed so canDeploy() allows retry
      account.markAsFailed();
      await this.deps.accountRepository.save(account);
      this.log.warn({accountId: account.id}, 'Stuck deploying account with no txHash, marked as failed');
      throw new InvalidAccountStateError(account.getStatus(), 'deploy', 'deployment had no transaction, please retry');
    }

    this.log.info({accountId: account.id, txHash}, 'Recovering stuck deployment, checking tx on-chain');
    try {
      await this.deps.starknetGateway.waitForTransaction(txHash);

      const address = account.getStarknetAddress();
      if (address && await this.deps.starknetGateway.isDeployed(address)) {
        account.markAsDeployed();
        await this.deps.accountRepository.save(account);
        this.log.info({accountId: account.id, txHash}, 'Stuck deployment recovered: confirmed on-chain');
        return {account, txHash};
      }
    } catch {
      // tx rejected or not found on-chain
    }

    // Deployment failed on-chain — mark as failed so canDeploy() allows retry
    account.markAsFailed();
    await this.deps.accountRepository.save(account);
    this.log.warn({accountId: account.id, txHash}, 'Stuck deployment tx failed on-chain, marked as failed');
    throw new InvalidAccountStateError(account.getStatus(), 'deploy', 'previous deployment failed on-chain, please retry');
  }

  /**
   * Waits for on-chain confirmation and updates account status accordingly.
   */
  private async waitForDeploymentConfirmation(account: Account, txHash: string): Promise<void> {
    try {
      await this.deps.starknetGateway.waitForTransaction(txHash);

      // Verify the contract is actually deployed at the expected address
      const address = account.getStarknetAddress();
      if (!address || !(await this.deps.starknetGateway.isDeployed(address))) {
        this.log.error({accountId: account.id, txHash, address}, 'Post-deployment verification failed: no contract at expected address');
        account.markAsFailed();
      } else {
        account.markAsDeployed();
        this.log.info({accountId: account.id, txHash}, 'Account deployment confirmed');
      }
    } catch {
      account.markAsFailed();
      this.log.error({accountId: account.id, txHash}, 'Account deployment failed');
    }
    await this.deps.accountRepository.save(account);
  }
}
