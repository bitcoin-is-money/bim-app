import {InvalidStateTransitionError} from '../shared';
import {
  type AccountData,
  AccountId,
  type AccountStatus,
  type CreateAccountParams,
  CredentialId,
  InvalidAccountStateError,
  StarknetAddress,
} from './types';

/**
 * Account entity representing a user in our application.
 *
 * An Account links together:
 * - A username (unique identifier in our app)
 * - A WebAuthn credential (for passwordless authentication via biometrics/security keys)
 * - A Starknet smart contract account (Account Abstraction wallet on-chain)
 *
 * The Account is persisted in our database and tracks the deployment status
 * of the corresponding Starknet smart contract.
 *
 * Lifecycle:
 * - pending: Account created in DB, Starknet address computed, awaiting deployment
 * - deploying: Deployment transaction submitted to Starknet
 * - deployed: Smart contract successfully deployed on Starknet, the account is fully operational
 * - failed: Deployment transaction failed
 */
export class Account {
  private status: AccountStatus;
  private deploymentTxHash?: string;
  private starknetAddress?: StarknetAddress;
  private signCount: number;
  private updatedAt: Date;

  private constructor(
    readonly id: AccountId,
    readonly username: string,
    readonly credentialId: CredentialId,
    readonly publicKey: string,
    readonly credentialPublicKey: string | undefined,
    readonly createdAt: Date,
    status: AccountStatus,
    signCount: number,
    starknetAddress?: StarknetAddress,
    deploymentTxHash?: string,
    updatedAt?: Date,
  ) {
    this.status = status;
    this.signCount = signCount;
    this.starknetAddress = starknetAddress;
    this.deploymentTxHash = deploymentTxHash;
    this.updatedAt = updatedAt ?? createdAt;
  }

  /**
   * Creates a new Account in pending status.
   */
  static create(params: CreateAccountParams): Account {
    const now = new Date();
    return new Account(
      params.id,
      params.username,
      params.credentialId,
      params.publicKey,
      params.credentialPublicKey,
      now,
      'pending',
      0,
    );
  }

  /**
   * Reconstitutes an Account from persisted data.
   */
  static fromData(data: AccountData): Account {
    return new Account(
      data.id,
      data.username,
      data.credentialId,
      data.publicKey,
      data.credentialPublicKey,
      data.createdAt,
      data.status,
      data.signCount,
      data.starknetAddress,
      data.deploymentTxHash,
      data.updatedAt,
    );
  }

  /**
   * Returns the current status of the account.
   */
  getStatus(): AccountStatus {
    return this.status;
  }

  /**
   * Returns the Starknet address if the account has been deployed.
   */
  getStarknetAddress(): StarknetAddress | undefined {
    return this.starknetAddress;
  }

  /**
   * Returns the deployment transaction hash if the deployment has started.
   */
  getDeploymentTxHash(): string | undefined {
    return this.deploymentTxHash;
  }

  /**
   * Returns the WebAuthn sign counter for replay protection.
   */
  getSignCount(): number {
    return this.signCount;
  }

  /**
   * Returns the last update timestamp.
   */
  getUpdatedAt(): Date {
    return this.updatedAt;
  }

  /**
   * Sets the computed Starknet address before deployment.
   * Can only be called when the account is in pending status.
   */
  setStarknetAddress(address: StarknetAddress): void {
    if (this.status !== 'pending') {
      throw new InvalidAccountStateError(
        this.status, 'set Starknet address', 'pending expected');
    }
    this.starknetAddress = address;
    this.updatedAt = new Date();
  }

  /**
   * Marks the account as deploying with the given transaction hash.
   * Can only be called when the account is in pending status.
   */
  markAsDeploying(txHash: string): void {
    if (this.status !== 'pending') {
      throw new InvalidStateTransitionError(this.status, 'deploying');
    }
    this.status = 'deploying';
    this.deploymentTxHash = txHash;
    this.updatedAt = new Date();
  }

  /**
   * Marks the account as successfully deployed.
   * Can only be called when the account is in deploying status.
   */
  markAsDeployed(): void {
    if (this.status !== 'deploying') {
      throw new InvalidStateTransitionError(this.status, 'deployed');
    }
    this.status = 'deployed';
    this.updatedAt = new Date();
  }

  /**
   * Marks the account deployment as failed.
   * Can only be called when the account is in deploying status.
   */
  markAsFailed(): void {
    if (this.status !== 'deploying') {
      throw new InvalidStateTransitionError(this.status, 'failed');
    }
    this.status = 'failed';
    this.updatedAt = new Date();
  }

  /**
   * Updates the WebAuthn sign counter after successful authentication.
   */
  updateSignCount(newCount: number): void {
    if (newCount <= this.signCount) {
      throw new InvalidStateTransitionError(
        `signCount=${this.signCount}`,
        `signCount=${newCount}`,
      );
    }
    this.signCount = newCount;
    this.updatedAt = new Date();
  }

  /**
   * Checks if the account is deployed and ready for transactions.
   */
  isDeployed(): boolean {
    return this.status === 'deployed';
  }

  /**
   * Checks if the account can be deployed.
   */
  canDeploy(): boolean {
    return this.status === 'pending' && this.starknetAddress !== undefined;
  }

  /**
   * Exports the account data for persistence.
   */
  toData(): AccountData {
    return {
      id: this.id,
      username: this.username,
      credentialId: this.credentialId,
      publicKey: this.publicKey,
      credentialPublicKey: this.credentialPublicKey,
      starknetAddress: this.starknetAddress,
      status: this.status,
      deploymentTxHash: this.deploymentTxHash,
      signCount: this.signCount,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
