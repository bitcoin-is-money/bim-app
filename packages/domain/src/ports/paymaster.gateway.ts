import {StarknetAddress} from '../account';
import type {DeployTransaction, StarknetTransaction} from './starknet.gateway';

/**
 * Gateway interface for AVNU Paymaster interactions (gasless transactions).
 */
export interface PaymasterGateway {
  /**
   * Executes a transaction via the paymaster (gasless).
   */
  executeTransaction(params: {
    transaction: StarknetTransaction | DeployTransaction;
    accountAddress: StarknetAddress;
  }): Promise<PaymasterResult>;

  /**
   * Builds a transaction with paymaster sponsorship.
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
