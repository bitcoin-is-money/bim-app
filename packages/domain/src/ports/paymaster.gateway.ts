import {StarknetAddress} from '../account';
import type {DeployTransaction, StarknetCall, StarknetTransaction} from './starknet.gateway';

/**
 * Gateway interface for AVNU Paymaster interactions (gasless transactions).
 */
export interface PaymasterGateway {
  /**
   * Executes a deploy transaction via the paymaster (gasless).
   * Deploy transactions don't need client-side signing.
   */
  executeTransaction(params: {
    transaction: StarknetTransaction | DeployTransaction;
    accountAddress: StarknetAddress;
  }): Promise<PaymasterResult>;

  /**
   * Builds an invoke transaction via SNIP-29 paymaster_buildTransaction.
   * Returns OutsideExecution typed data that must be signed by the user.
   */
  buildInvokeTransaction(params: {
    calls: readonly StarknetCall[];
    accountAddress: StarknetAddress;
  }): Promise<{typedData: unknown}>;

  /**
   * Executes a signed invoke transaction via SNIP-29 paymaster_executeTransaction.
   * The signature must be in Argent compact_no_legacy format.
   */
  executeInvokeTransaction(params: {
    typedData: unknown;
    signature: string[];
    accountAddress: StarknetAddress;
  }): Promise<PaymasterResult>;

  /**
   * Builds a transaction with paymaster sponsorship (legacy).
   */
  buildPaymasterTransaction(params: {
    transaction: StarknetTransaction;
    accountAddress: StarknetAddress;
  }): Promise<PaymasterTransaction>;

  /**
   * Checks if paymaster is available for the given account.
   */
  isAvailable(accountAddress: StarknetAddress): Promise<boolean>;

  /**
   * Gets the sponsored gas limit for the current period.
   */
  getSponsoredGasLimit(): Promise<bigint>;
}

export interface PaymasterResult {
  txHash: string;
  success: boolean;
}

export interface PaymasterTransaction {
  transaction: StarknetTransaction;
  sponsorSignature: string;
  gasToken?: string;
}
