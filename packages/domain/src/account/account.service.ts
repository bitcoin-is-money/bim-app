import type {Logger} from 'pino';
import type {AccountRepository, PaymasterGateway, StarknetGateway} from '../ports';
import {Account} from './account';
import {STRKToken, STRKTokenBalance, WBTCToken, WBTCTokenBalance} from './balance';
import {AccountAlreadyExistsError, AccountNotFoundError, InvalidAccountStateError} from './errors';
import {AccountId, CredentialId} from './types';

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
  strkBalance: STRKTokenBalance;
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
    this.log = deps.logger.child({name: 'account.service.ts'});
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

    const credentialPublicKey = input.credentialPublicKey;
    const account = Account.create({
      id: input.accountId,
      username: input.username,
      credentialId: CredentialId.of(input.credentialId),
      publicKey: input.publicKey,
      ...(credentialPublicKey !== undefined && {credentialPublicKey}),
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
    const starknetAddress = this.deps.starknetGateway.calculateAccountAddress({
      publicKey: account.publicKey,
    });

    const deployTx = this.deps.starknetGateway.buildDeployTransaction({
      starknetAddress,
      publicKey: account.publicKey,
    });

    // Atomic lock: pending → deploying (before the expensive paymaster call).
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
    this.log.info({accountId: input.accountId, starknetAddress, txHash}, 'Account deployment submitted');

    // @review-accepted: fire-and-forget intentional — try/catch inside waitForDeploymentConfirmation
    void this.waitForDeploymentConfirmation(account, txHash);

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
      return {
        wbtcBalance: WBTCTokenBalance.zero(),
        strkBalance: STRKTokenBalance.zero()
      };
    }

    const address = account.getStarknetAddress();
    if (!address) {
      throw new InvalidAccountStateError(account.getStatus(), 'get balance', 'deployed account has no starknet address');
    }

    const fetchBalance = async (token: string): Promise<bigint> => {
      try {
        return await this.deps.starknetGateway.getBalance({address, token});
      } catch (err) {
        this.log.warn({address, token}, `Failed to fetch balance (${err instanceof Error ? err.message : String(err)})`);
        return 0n;
      }
    };

    const [wbtcAmount, strkAmount] = await Promise.all([
      fetchBalance(WBTCToken.symbol),
      fetchBalance(STRKToken.symbol),
    ]);

    return {
      wbtcBalance: {
        symbol: WBTCToken.symbol,
        amount: wbtcAmount.toString(),
        decimals: WBTCToken.decimals,
      },
      strkBalance: {
        symbol: STRKToken.symbol,
        amount: strkAmount.toString(),
        decimals: STRKToken.decimals,
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
