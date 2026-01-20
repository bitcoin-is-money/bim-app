import type {DeployTransaction, StarknetGateway, StarknetTransaction, TransactionReceipt,} from '@bim/domain';
import {ExternalServiceError, StarknetAddress} from '@bim/domain';
import {CallData, hash, RpcProvider} from 'starknet';

/**
 * Configuration for Starknet gateway.
 */
export interface StarknetGatewayConfig {
  rpcUrl: string;
  accountClassHash: string;
}

/**
 * Starknet gateway implementation using starknet.js RpcProvider.
 */
export class StarknetRpcGateway implements StarknetGateway {
  private readonly provider: RpcProvider;

  constructor(
    private readonly config: StarknetGatewayConfig
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
    tokenAddress: string;
  }): Promise<bigint> {
    try {
      const result = await this.provider.callContract({
        contractAddress: params.tokenAddress,
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
}
