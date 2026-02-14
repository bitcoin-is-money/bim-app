import {basename} from 'node:path';
import type {Logger} from 'pino';
import type {AccountRepository, PaymasterGateway, StarknetGateway} from '../ports';
import {Account} from './account';
import {WBTCToken, WBTCTokenBalance} from './balance';
import {
  AccountAlreadyExistsError,
  AccountId,
  AccountNotFoundError,
  CredentialId,
  InvalidAccountStateError,
  type StarknetAddress,
} from './types';

// =============================================================================
// Dependencies
// =============================================================================

export interface AccountServiceDeps {
  accountRepository: AccountRepository;
  starknetGateway: StarknetGateway;
  paymasterGateway: PaymasterGateway;
  logger: Logger;
}

// =============================================================================
// Input/Output Types
// =============================================================================

export interface CreateAccountInput {
  accountId: AccountId;
  username: string;
  credentialId: string;
  publicKey: string;
  credentialPublicKey?: string;
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

export interface GetBalanceInput {
  accountId: string;
}

export interface GetBalanceOutput {
  wbtcBalance: WBTCTokenBalance;
}

// =============================================================================
// Service Class
// =============================================================================

/**
 * Service for account management (creation, deployment, balance).
 */
export class AccountService {
  private readonly log: Logger;

  constructor(private readonly deps: AccountServiceDeps) {
    this.log = deps.logger.child({name: basename(import.meta.filename)});
  }

  /**
   * Creates a new account with WebAuthn credentials.
   * The account is created in 'pending' status, ready for deployment.
   * Starknet address will be computed during deployment.
   *
   * @throws AccountAlreadyExistsError if username is taken
   */
  async create(input: CreateAccountInput): Promise<Account> {
    this.log.info({accountId: input.accountId, username: input.username}, 'Creating account');
    const exists = await this.deps.accountRepository.existsByUsername(input.username);
    if (exists) {
      throw new AccountAlreadyExistsError(input.username);
    }

    const account = Account.create({
      id: input.accountId,
      username: input.username,
      credentialId: CredentialId.of(input.credentialId),
      publicKey: input.publicKey,
      credentialPublicKey: input.credentialPublicKey,
    });

    this.log.debug("Saving account");
    await this.deps.accountRepository.save(account);

    this.log.info('Account created');
    return account;
  }

  /**
   * Deploys an account's smart contract to Starknet via the AVNU paymaster (gasless).
   * Computes the Starknet address and transitions the account from 'pending' → 'deploying' → 'deployed' (or 'failed').
   *
   * @throws AccountNotFoundError if account doesn't exist
   * @throws InvalidAccountStateError if the account is not in 'pending' status
   */
  async deploy(input: DeployAccountInput): Promise<DeployAccountOutput> {
    this.log.info({accountId: input.accountId}, 'Deploying account');
    const account = await this.deps.accountRepository.findById(input.accountId);
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
    const starknetAddress = await this.deps.starknetGateway.calculateAccountAddress({
      publicKey: account.publicKey,
    });

    const deployTx = await this.deps.starknetGateway.buildDeployTransaction({
      starknetAddress,
      publicKey: account.publicKey,
    });

    // Execute via paymaster for gasless deployment
    this.log.info('Deploying account via paymaster');
    const {txHash} = await this.deps.paymasterGateway.executeTransaction({
      transaction: deployTx,
      accountAddress: starknetAddress,
    });

    account.markAsDeploying(starknetAddress, txHash);
    this.log.debug('Saving account');
    await this.deps.accountRepository.save(account);
    this.log.info({accountId: input.accountId, starknetAddress, txHash}, 'Account deployment submitted');

    if (input.sync) {
      // Wait for on-chain confirmation before returning
      await this.waitForDeploymentConfirmation(account, txHash);
    } else {
      // Fire-and-forget: confirm deployment asynchronously
      this.waitForDeploymentConfirmation(account, txHash);
    }

    return {account, txHash};
  }

  /**
   * Fetches token balances for an account's Starknet address.
   * Returns zero balances if the account is not deployed yet.
   *
   * @throws AccountNotFoundError if account doesn't exist
   */
  async getBalance(input: GetBalanceInput): Promise<GetBalanceOutput> {
    const accountId = AccountId.of(input.accountId);
    const account = await this.deps.accountRepository.findById(accountId);

    if (!account) {
      throw new AccountNotFoundError(accountId);
    }

    if (!account.isDeployed()) {
      return {wbtcBalance: WBTCTokenBalance.zero()};
    }

    const address: StarknetAddress = account.getStarknetAddress()!;
    let amount: bigint;
    try {
      amount = await this.deps.starknetGateway.getBalance({
        address,
        token: WBTCToken.symbol,
      });
    } catch {
      this.log.warn({address}, 'Failed to fetch balance');
      amount = BigInt(0);
    }

    return {
      wbtcBalance: {
        symbol: WBTCToken.symbol,
        amount: amount.toString(),
        decimals: WBTCToken.decimals,
      },
    };
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Waits for on-chain confirmation and updates account status accordingly.
   */
  private async waitForDeploymentConfirmation(account: Account, txHash: string): Promise<void> {
    try {
      await this.deps.starknetGateway.waitForTransaction(txHash);
      account.markAsDeployed();
      this.log.info({accountId: account.id, txHash}, 'Account deployment confirmed');
    } catch {
      account.markAsFailed();
      this.log.error({accountId: account.id, txHash}, 'Account deployment failed');
    }
    await this.deps.accountRepository.save(account);
  }
}
