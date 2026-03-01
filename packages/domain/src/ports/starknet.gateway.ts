import type {StarknetAddress} from '../account';

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
    token: string;
  }): Promise<bigint>;

  /**
   * Estimates the fee for a transaction.
   */
  estimateFee(transaction: StarknetTransaction): Promise<bigint>;

  /**
   * Executes a multicall transaction from the given account.
   * The adapter handles signing (WebAuthn / paymaster) and submission.
   * @deprecated Use buildCalls + executeSignedCalls for the SNIP-29 flow.
   */
  executeCalls(params: {
    senderAddress: StarknetAddress;
    calls: readonly StarknetCall[];
  }): Promise<{txHash: string}>;

  /**
   * Builds a multicall transaction via the paymaster.
   * Returns OutsideExecution typed data and the message hash to use as WebAuthn challenge.
   */
  buildCalls(params: {
    senderAddress: StarknetAddress;
    calls: readonly StarknetCall[];
  }): Promise<{typedData: unknown; messageHash: string}>;

  /**
   * Executes a signed multicall transaction via the paymaster.
   * The signature must be in Argent compact_no_legacy format.
   */
  executeSignedCalls(params: {
    senderAddress: StarknetAddress;
    typedData: unknown;
    signature: string[];
  }): Promise<{txHash: string}>;
}

/**
 * Generic Starknet contract call.
 * Compatible with ERC-20 transfer calls and any other entrypoint.
 */
export interface StarknetCall {
  readonly contractAddress: string;
  readonly entrypoint: string;
  readonly calldata: readonly string[];
}

export interface DeployTransaction {
  type: 'DEPLOY_ACCOUNT';
  contractAddress: string;
  classHash: string;
  salt: string;
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
