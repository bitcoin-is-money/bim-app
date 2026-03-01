import {StarknetAddress} from "@bim/domain/account";
import type {
  DeployTransaction,
  PaymasterGateway,
  StarknetCall,
  StarknetGateway,
  StarknetTransaction,
  TransactionReceipt,
} from "@bim/domain/ports";
import {DomainError, ExternalServiceError} from "@bim/domain/shared";

import type {Logger} from "pino";
import {CallData, hash, RpcProvider, typedData as starknetTypedData} from 'starknet';
import {ARGENT_WEBAUTHN_SALT, buildArgentWebauthnCalldata} from './argent-calldata.js';

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
  ) {
    this.provider = new RpcProvider({nodeUrl: config.rpcUrl});
    this.log = rootLogger.child({name: 'starknet.gateway.ts'});
  }

  async calculateAccountAddress(params: {
    publicKey: string;
  }): Promise<StarknetAddress> {
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
        `Failed to calculate address: ${error}`,
      );
    }
  }

  async buildDeployTransaction(params: {
    starknetAddress: StarknetAddress;
    publicKey: string;
  }): Promise<DeployTransaction> {
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
        `Transaction ${txHash} failed: ${error}`,
      );
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
        `Failed to get nonce: ${error}`,
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
      const low = BigInt(result[0] || '0');
      const high = BigInt(result[1] || '0');

      return low + (high << 128n);
    } catch (error) {
      throw new ExternalServiceError(
        'Starknet',
        `Failed to get balance: ${error}`,
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
  }): Promise<{ txHash: string }> {
    try {
      this.log.info(
        {senderAddress: params.senderAddress.toString(), callCount: params.calls.length},
        'Executing multicall');
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

      this.log.info({txHash: result.txHash}, 'Multicall transaction submitted');
      return {txHash: result.txHash};
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error;
      throw new ExternalServiceError(
        'Starknet',
        `Failed to execute calls: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // ===========================================================================
  // SNIP-29 Build / Execute (with WebAuthn signing)
  // ===========================================================================

  async buildCalls(params: {
    senderAddress: StarknetAddress;
    calls: readonly StarknetCall[];
  }): Promise<{typedData: unknown; messageHash: string}> {
    try {
      this.log.info(
        {senderAddress: params.senderAddress.toString(), callCount: params.calls.length},
        'Building calls via paymaster',
      );

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
      this.log.info(
        {senderAddress: params.senderAddress.toString(), signatureLength: params.signature.length},
        'Executing signed calls via paymaster',
      );

      const result = await this.paymasterGateway.executeInvokeTransaction({
        typedData: params.typedData,
        signature: params.signature,
        accountAddress: params.senderAddress,
      });

      if (!result.success) {
        throw new Error('Transaction execution failed');
      }

      this.log.info({txHash: result.txHash}, 'Signed calls transaction submitted');
      return {txHash: result.txHash};
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error;
      throw new ExternalServiceError(
        'Starknet',
        `Failed to execute signed calls: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // ===========================================================================
  // Private helpers
  // ===========================================================================

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
