import {StarknetAddress} from "@bim/domain/account";
import type {
  DeployTransaction,
  PaymasterGateway,
  StarknetCall,
  StarknetGateway,
  StarknetTransaction,
  TransactionReceipt,
} from "@bim/domain/ports";
import {ExternalServiceError} from "@bim/domain/shared";
import {CallData, hash, RpcProvider} from 'starknet';

/**
 * Configuration for Starknet gateway.
 */
export interface StarknetGatewayConfig {
  rpcUrl: string;
  accountClassHash: string;
  tokenAddresses: Record<string, string>;
}

/**
 * Starknet gateway implementation using starknet.js RpcProvider.
 */
export class StarknetRpcGateway implements StarknetGateway {
  private readonly provider: RpcProvider;

  constructor(
    private readonly config: StarknetGatewayConfig,
    private readonly paymasterGateway: PaymasterGateway,
  ) {
    this.provider = new RpcProvider({ nodeUrl: config.rpcUrl });
  }

  async calculateAccountAddress(params: {
    publicKey: string;
  }): Promise<StarknetAddress> {
    try {
      const salt = params.publicKey;
      const address = hash.calculateContractAddressFromHash(
        salt,
        this.config.accountClassHash,
        CallData.compile([params.publicKey]),
        0,
      );

      return StarknetAddress.of(address);
    } catch (error) {
      throw new ExternalServiceError(
        'Starknet',
        `Failed to calculate address: ${error}`,
      );
    }
  }

  async buildDeployTransaction(params: {
    starknetAddress: StarknetAddress;
    publicKey: string;
  }): Promise<DeployTransaction> {
    return {
      type: 'DEPLOY_ACCOUNT',
      contractAddress: params.starknetAddress.toString(),
      classHash: this.config.accountClassHash,
      constructorCallData: [params.publicKey],
      signature: [],
    };
  }

  async waitForTransaction(
    txHash: string
  ): Promise<TransactionReceipt> {
    try {
      const receipt = await this.provider.waitForTransaction(txHash);

      if (receipt.isReverted()) {
        return {
          transactionHash: txHash,
          status: 'REJECTED',
        };
      }

      if (receipt.isSuccess()) {
        const value = receipt.value;
        return {
          transactionHash: txHash,
          status:
            value.finality_status === 'ACCEPTED_ON_L1'
              ? 'ACCEPTED_ON_L1'
              : 'ACCEPTED_ON_L2',
          blockNumber: value.block_number,
          blockHash: value.block_hash,
        };
      }

      return {
        transactionHash: txHash,
        status: 'REJECTED',
      };
    } catch (error) {
      throw new ExternalServiceError(
        'Starknet',
        `Transaction ${txHash} failed: ${error}`,
      );
    }
  }

  async getNonce(address: StarknetAddress): Promise<bigint> {
    try {
      const nonce = await this.provider.getNonceForAddress(address.toString());
      return BigInt(nonce);
    } catch (error) {
      throw new ExternalServiceError(
        'Starknet',
        `Failed to get nonce: ${error}`,
      );
    }
  }

  async getBalance(params: {
    address: StarknetAddress;
    token: string;
  }): Promise<bigint> {
    const tokenAddress = this.config.tokenAddresses[params.token];
    if (!tokenAddress) {
      throw new ExternalServiceError(
        'Starknet',
        `Unknown token: ${params.token}`,
      );
    }

    try {
      const result = await this.provider.callContract({
        contractAddress: tokenAddress,
        entrypoint: 'balanceOf',
        calldata: [params.address.toString()],
      });

      // Balance is returned as two felts (low, high) for u256
      const low: bigint = BigInt(result[0] || '0');
      const high: bigint = BigInt(result[1] || '0');

      return low + (high << 128n);
    } catch (error) {
      throw new ExternalServiceError(
        'Starknet',
        `Failed to get balance: ${error}`,
      );
    }
  }

  async estimateFee(transaction: StarknetTransaction): Promise<bigint> {
    try {
      const invocation = {
        contractAddress: transaction.contractAddress,
        calldata: transaction.callData,
      };
      const details = {
        nonce: 0n,
        version: '0x1' as const,
      };

      const result = await this.provider.getInvokeEstimateFee(
        invocation,
        details,
      );

      return result.overall_fee;
    } catch (error) {
      throw new ExternalServiceError(
        'Starknet',
        `Failed to estimate fee: ${error}`,
      );
    }
  }

  async executeCalls(params: {
    senderAddress: StarknetAddress;
    calls: readonly StarknetCall[];
  }): Promise<{txHash: string}> {
    try {
      const calldata = this.encodeMulticall(params.calls);

      const transaction: StarknetTransaction = {
        type: 'INVOKE',
        contractAddress: params.senderAddress.toString(),
        callData: calldata,
      };

      const result = await this.paymasterGateway.executeTransaction({
        transaction,
        accountAddress: params.senderAddress,
      });

      if (!result.success) {
        throw new Error('Transaction execution failed');
      }

      return {txHash: result.txHash};
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error;
      throw new ExternalServiceError(
        'Starknet',
        `Failed to execute calls: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Encodes an array of calls into Cairo 1 __execute__ calldata format:
   * [num_calls, to_0, selector_0, data_0_len, ...data_0, to_1, selector_1, ...]
   */
  private encodeMulticall(calls: readonly StarknetCall[]): string[] {
    const encoded: string[] = [String(calls.length)];

    for (const call of calls) {
      encoded.push(call.contractAddress);
      encoded.push(hash.getSelectorFromName(call.entrypoint));
      encoded.push(String(call.calldata.length));
      for (const datum of call.calldata) {
        encoded.push(datum);
      }
    }

    return encoded;
  }
}
