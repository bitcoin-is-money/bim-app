import { StarknetAddress } from '../account/types';
/**
 * Gateway interface for Starknet blockchain interactions.
 */
export interface StarknetGateway {
    /**
     * Calculates the deterministic account address from a public key.
     */
    calculateAccountAddress(params: {
        publicKey: string;
    }): Promise<StarknetAddress>;
    /**
     * Builds a deployment transaction for a new account.
     */
    buildDeployTransaction(params: {
        starknetAddress: StarknetAddress;
        publicKey: string;
    }): Promise<DeployTransaction>;
    /**
     * Waits for a transaction to be confirmed.
     */
    waitForTransaction(txHash: string): Promise<TransactionReceipt>;
    /**
     * Gets the current nonce for an account.
     */
    getNonce(address: StarknetAddress): Promise<bigint>;
    /**
     * Gets the balance of a token for an address.
     */
    getBalance(params: {
        address: StarknetAddress;
        tokenAddress: string;
    }): Promise<bigint>;
    /**
     * Estimates the fee for a transaction.
     */
    estimateFee(transaction: StarknetTransaction): Promise<bigint>;
}
export interface DeployTransaction {
    type: 'DEPLOY_ACCOUNT';
    contractAddress: string;
    classHash: string;
    constructorCallData: string[];
    signature: string[];
}
export interface StarknetTransaction {
    type: string;
    contractAddress: string;
    callData: string[];
    signature?: string[];
}
export interface TransactionReceipt {
    transactionHash: string;
    status: 'ACCEPTED_ON_L2' | 'ACCEPTED_ON_L1' | 'REJECTED';
    blockNumber?: number;
    blockHash?: string;
}
//# sourceMappingURL=starknet.gateway.d.ts.map