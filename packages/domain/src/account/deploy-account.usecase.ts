import type {AccountRepository, PaymasterGateway, StarknetGateway} from '@bim/domain/ports';
import {Account} from './account';
import {AccountId, AccountNotFoundError, InvalidAccountStateError,} from './types';

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
export function getDeployAccountUseCase(deps: DeployAccountDeps): DeployAccountUseCase {
  return async (input: DeployAccountInput): Promise<DeployAccountOutput> => {
    const account = await deps.accountRepository.findById(input.accountId);
    if (!account) {
      throw new AccountNotFoundError(input.accountId);
    }

    if (!account.canDeploy()) {
      throw new InvalidAccountStateError(
        account.getStatus(),
        'deploy',
        'account must be pending with a computed Starknet address',
      );
    }

    const deployTx = await deps.starknetGateway.buildDeployTransaction({
      starknetAddress: account.getStarknetAddress()!,
      publicKey: account.publicKey,
    });

    // Execute via paymaster for gasless deployment
    const { txHash } = await deps.paymasterGateway.executeTransaction({
      transaction: deployTx,
      accountAddress: account.getStarknetAddress()!,
    });

    account.markAsDeploying(txHash);
    await deps.accountRepository.save(account);

    // Confirm deployment asynchronously
    waitForDeploymentConfirmation(deps, account, txHash);

    return { account, txHash };
  };
}

/**
 * Waits for on-chain confirmation and updates account status accordingly.
 */
async function waitForDeploymentConfirmation(
  deps: Pick<DeployAccountDeps, 'accountRepository' | 'starknetGateway'>,
  account: Account,
  txHash: string,
): Promise<void> {
  try {
    await deps.starknetGateway.waitForTransaction(txHash);
    account.markAsDeployed();
  } catch {
    account.markAsFailed();
  }
  await deps.accountRepository.save(account);
}
