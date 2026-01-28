import type {AccountRepository, PaymasterGateway, StarknetGateway} from '../ports';
import {Account} from './account';
import {AccountId, AccountNotFoundError, InvalidAccountStateError,} from './types';

export interface DeployAccountDeps {
  accountRepository: AccountRepository;
  starknetGateway: StarknetGateway;
  paymasterGateway: PaymasterGateway;
}

export interface DeployAccountInput {
  accountId: AccountId;
  /** If true, wait for on-chain confirmation before returning. Default: false */
  sync?: boolean;
}

export interface DeployAccountOutput {
  account: Account;
  txHash: string;
}

export type DeployAccountService = (input: DeployAccountInput) => Promise<DeployAccountOutput>;

/**
 * Deploys an account's smart contract to Starknet via the AVNU paymaster (gasless).
 * Computes the Starknet address and transitions the account from 'pending' → 'deploying' → 'deployed' (or 'failed').
 */
export function getDeployAccountService(deps: DeployAccountDeps): DeployAccountService {
  return async (input: DeployAccountInput): Promise<DeployAccountOutput> => {
    const account = await deps.accountRepository.findById(input.accountId);
    if (!account) {
      throw new AccountNotFoundError(input.accountId);
    }

    if (!account.canDeploy()) {
      throw new InvalidAccountStateError(
        account.getStatus(),
        'deploy',
        'account must be in pending status',
      );
    }

    // Compute the deterministic Starknet address from the public key
    const starknetAddress = await deps.starknetGateway.calculateAccountAddress({
      publicKey: account.publicKey,
    });

    const deployTx = await deps.starknetGateway.buildDeployTransaction({
      starknetAddress,
      publicKey: account.publicKey,
    });

    // Execute via paymaster for gasless deployment
    const { txHash } = await deps.paymasterGateway.executeTransaction({
      transaction: deployTx,
      accountAddress: starknetAddress,
    });

    account.markAsDeploying(starknetAddress, txHash);
    await deps.accountRepository.save(account);

    if (input.sync) {
      // Wait for on-chain confirmation before returning
      await waitForDeploymentConfirmation(deps, account, txHash);
    } else {
      // Fire-and-forget: confirm deployment asynchronously
      waitForDeploymentConfirmation(deps, account, txHash);
    }

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
