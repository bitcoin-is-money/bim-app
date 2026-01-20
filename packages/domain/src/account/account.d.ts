import { type AccountData, AccountId, type AccountStatus, type CreateAccountParams, CredentialId, StarknetAddress } from './types';
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
export declare class Account {
    readonly id: AccountId;
    readonly username: string;
    readonly credentialId: CredentialId;
    readonly publicKey: string;
    readonly credentialPublicKey: string | undefined;
    readonly createdAt: Date;
    private status;
    private deploymentTxHash?;
    private starknetAddress?;
    private signCount;
    private updatedAt;
    private constructor();
    /**
     * Creates a new Account in pending status.
     */
    static create(params: CreateAccountParams): Account;
    /**
     * Reconstitutes an Account from persisted data.
     */
    static fromData(data: AccountData): Account;
    /**
     * Returns the current status of the account.
     */
    getStatus(): AccountStatus;
    /**
     * Returns the Starknet address if the account has been deployed.
     */
    getStarknetAddress(): StarknetAddress | undefined;
    /**
     * Returns the deployment transaction hash if the deployment has started.
     */
    getDeploymentTxHash(): string | undefined;
    /**
     * Returns the WebAuthn sign counter for replay protection.
     */
    getSignCount(): number;
    /**
     * Returns the last update timestamp.
     */
    getUpdatedAt(): Date;
    /**
     * Sets the computed Starknet address before deployment.
     * Can only be called when the account is in pending status.
     */
    setStarknetAddress(address: StarknetAddress): void;
    /**
     * Marks the account as deploying with the given transaction hash.
     * Can only be called when the account is in pending status.
     */
    markAsDeploying(txHash: string): void;
    /**
     * Marks the account as successfully deployed.
     * Can only be called when the account is in deploying status.
     */
    markAsDeployed(): void;
    /**
     * Marks the account deployment as failed.
     * Can only be called when the account is in deploying status.
     */
    markAsFailed(): void;
    /**
     * Updates the WebAuthn sign counter after successful authentication.
     */
    updateSignCount(newCount: number): void;
    /**
     * Checks if the account is deployed and ready for transactions.
     */
    isDeployed(): boolean;
    /**
     * Checks if the account can be deployed.
     */
    canDeploy(): boolean;
    /**
     * Exports the account data for persistence.
     */
    toData(): AccountData;
}
//# sourceMappingURL=account.d.ts.map