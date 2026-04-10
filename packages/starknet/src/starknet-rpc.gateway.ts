import {StarknetAddress} from "@bim/domain/account";
import type {HealthRegistry} from "@bim/domain/health";
import type {
  DeployTransaction,
  PaymasterGateway,
  StarknetCall,
  StarknetGateway,
  StarknetTransaction,
  TransactionReceipt,
} from "@bim/domain/ports";
import {DomainError, ExternalServiceError, SanitizedError} from "@bim/domain/shared";
import {ETransactionType} from '@starknet-io/starknet-types-010';

import pTimeout from 'p-timeout';
import type {Logger} from "pino";
import {CallData, hash, RpcProvider, typedData as starknetTypedData} from 'starknet';
import {ARGENT_WEBAUTHN_SALT, buildArgentWebauthnCalldata} from './argent-calldata.js';

const HEALTH_CHECK_TIMEOUT_MS = 5_000;

/**
 * Configuration for Starknet gateway.
 */
export interface StarknetGatewayConfig {
  rpcUrl: string;
  accountClassHash: string;
  tokenAddresses: Record<string, string>;
  webauthnOrigin: string;
  webauthnRpId: string;
}

/**
 * Starknet gateway implementation using starknet.js RpcProvider.
 */
export class StarknetRpcGateway implements StarknetGateway {
  private readonly provider: RpcProvider;
  private readonly log: Logger;

  constructor(
    private readonly config: StarknetGatewayConfig,
    private readonly paymasterGateway: PaymasterGateway,
    rootLogger: Logger,
    private readonly healthRegistry: HealthRegistry,
  ) {
    this.provider = new RpcProvider({nodeUrl: config.rpcUrl});
    this.log = rootLogger.child({name: 'starknet-rpc.gateway.ts'});
  }

  /**
   * Pings the Starknet RPC by fetching the chain id.
   * Reports the component status to the injected HealthRegistry.
   */
  async checkHealth(): Promise<void> {
    try {
      await pTimeout(this.provider.getChainId(), {
        milliseconds: HEALTH_CHECK_TIMEOUT_MS,
        message: 'starknet_chainId timed out',
      });
      this.healthRegistry.reportHealthy('starknet-rpc');
    } catch (err: unknown) {
      const sanitized = SanitizedError.sanitize('Starknet RPC', err);
      this.log.error({starknetError: sanitized}, 'Starknet RPC health check failed');
      this.healthRegistry.reportDown('starknet-rpc', sanitized);
    }
  }

  calculateAccountAddress(params: {
    publicKey: string;
  }): StarknetAddress {
    this.log.debug({publicKey: params.publicKey.slice(0, 10) + '...'}, 'Calculating account address');
    try {
      const calldata = buildArgentWebauthnCalldata({
        origin: this.config.webauthnOrigin,
        rpId: this.config.webauthnRpId,
        publicKey: params.publicKey,
      });
      const address = hash.calculateContractAddressFromHash(
        ARGENT_WEBAUTHN_SALT,
        this.config.accountClassHash,
        CallData.compile(calldata),
        0,
      );

      return StarknetAddress.of(address);
    } catch (error) {
      throw new ExternalServiceError(
        'Starknet',
        `Failed to calculate address: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  buildDeployTransaction(params: {
    starknetAddress: StarknetAddress;
    publicKey: string;
  }): DeployTransaction {
    this.log.debug({address: params.starknetAddress.toString()}, 'Building deploy transaction');
    const calldata = buildArgentWebauthnCalldata({
      origin: this.config.webauthnOrigin,
      rpId: this.config.webauthnRpId,
      publicKey: params.publicKey,
    });
    return {
      type: 'DEPLOY_ACCOUNT',
      contractAddress: params.starknetAddress.toString(),
      classHash: this.config.accountClassHash,
      salt: ARGENT_WEBAUTHN_SALT,
      constructorCallData: calldata,
      signature: [],
    };
  }

  async waitForTransaction(
    txHash: string
  ): Promise<TransactionReceipt> {
    this.log.debug({txHash}, 'Waiting for transaction');
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
        `Transaction ${txHash} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async isDeployed(address: StarknetAddress): Promise<boolean> {
    try {
      const classHash = await this.provider.getClassHashAt(address.toString());
      return classHash !== '0x0';
    } catch {
      return false;
    }
  }

  async getNonce(address: StarknetAddress): Promise<bigint> {
    this.log.debug({address: address.toString()}, 'Getting nonce');
    try {
      const nonce = await this.provider.getNonceForAddress(address.toString());
      return BigInt(nonce);
    } catch (error) {
      throw new ExternalServiceError(
        'Starknet',
        `Failed to get nonce: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async getBalance(params: {
    address: StarknetAddress;
    token: string;
  }): Promise<bigint> {
    this.log.debug({address: params.address.toString(), token: params.token}, 'Getting balance');
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
      const low = BigInt(result[0] ?? '0');
      const high = BigInt(result[1] ?? '0');

      return low + (high << 128n);
    } catch (error) {
      throw new ExternalServiceError(
        'Starknet',
        `Failed to get balance: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async estimateFee(transaction: StarknetTransaction): Promise<bigint> {
    this.log.debug({contractAddress: transaction.contractAddress}, 'Estimating fee');
    try {
      const invocation = {
        contractAddress: transaction.contractAddress,
        calldata: transaction.callData,
      };
      const details = {
        nonce: 0n,
        version: '0x1' as const,
      };

      const [result] = await this.provider.getEstimateFeeBulk([
        {type: ETransactionType.INVOKE, ...invocation, ...details},
      ]);
      if (!result) {
        throw new ExternalServiceError('Starknet', 'No fee estimate returned. This should never happen, it is a bug in starknet provider.');
      }

      return result.overall_fee;
    } catch (error) {
      throw new ExternalServiceError(
        'Starknet',
        `Failed to estimate fee: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async buildCalls(params: {
    senderAddress: StarknetAddress;
    calls: readonly StarknetCall[];
  }): Promise<{typedData: unknown; messageHash: string}> {
    try {
      const logMsg = 'Building calls via paymaster';
      if (this.log.isLevelEnabled("debug")) {
        this.log.debug({senderAddress: params.senderAddress.toString(), callCount: params.calls.length}, logMsg);
      } else {
        this.log.info(logMsg);
      }

      const {typedData} = await this.paymasterGateway.buildInvokeTransaction({
        calls: params.calls,
        accountAddress: params.senderAddress,
      });

      // Compute the Starknet message hash from the typed data.
      // This hash is used as the WebAuthn challenge for signing.
      const messageHash = starknetTypedData.getMessageHash(
        typedData as Parameters<typeof starknetTypedData.getMessageHash>[0],
        params.senderAddress.toString(),
      );

      this.log.info(
        {senderAddress: params.senderAddress.toString(), messageHash},
        'Calls built successfully',
      );

      return {typedData, messageHash};
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new ExternalServiceError(
        'Starknet',
        `Failed to build calls: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async executeSignedCalls(params: {
    senderAddress: StarknetAddress;
    typedData: unknown;
    signature: string[];
  }): Promise<{txHash: string}> {
    try {
      const execLogMsg = 'Executing signed calls via paymaster';
      if (this.log.isLevelEnabled("debug")) {
        this.log.debug({senderAddress: params.senderAddress.toString(), signatureLength: params.signature.length}, execLogMsg);
      } else {
        this.log.info(execLogMsg);
      }
      const result = await this.paymasterGateway.executeInvokeTransaction({
        typedData: params.typedData,
        signature: params.signature,
        accountAddress: params.senderAddress,
      });

      if (!result.success) {
        throw new Error('Transaction execution failed');
      }
      const submittedLogMsg = 'Signed calls transaction submitted';
      if (this.log.isLevelEnabled("debug")) {
        this.log.debug({txHash: result.txHash}, submittedLogMsg);
      } else {
        this.log.info(submittedLogMsg);
      }
      return {txHash: result.txHash};
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new ExternalServiceError(
        'Starknet',
        `Failed to execute signed calls: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

}
