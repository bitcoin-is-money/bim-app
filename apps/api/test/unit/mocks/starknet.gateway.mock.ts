import {StarknetAddress} from '@bim/domain/account';
import type {
  DeployTransaction,
  StarknetCall,
  StarknetGateway,
  StarknetTransaction,
  TransactionReceipt,
} from '@bim/domain/ports';

/**
 * Mock implementation of StarknetGateway for testing purposes.
 *
 * Returns stub data for all methods. Use this when integration tests
 * need the Starknet gateway without a real devnet or paymaster.
 */
export class StarknetGatewayMock implements StarknetGateway {
  calculateAccountAddress(_params: {publicKey: string}): StarknetAddress {
    return StarknetAddress.of('0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
  }

  buildDeployTransaction(_params: {
    starknetAddress: StarknetAddress;
    publicKey: string;
  }): DeployTransaction {
    return {
      type: 'DEPLOY_ACCOUNT',
      contractAddress: '0x0123',
      classHash: '0xclass',
      salt: '0xsalt',
      constructorCallData: [],
      signature: [],
    };
  }

  async waitForTransaction(txHash: string): Promise<TransactionReceipt> {
    return {
      transactionHash: txHash,
      status: 'ACCEPTED_ON_L2',
      blockNumber: 1,
    };
  }

  async getNonce(_address: StarknetAddress): Promise<bigint> {
    return 0n;
  }

  async getBalance(_params: {address: StarknetAddress; token: string}): Promise<bigint> {
    return 1000000000000000000n; // 1 ETH
  }

  async estimateFee(_transaction: StarknetTransaction): Promise<bigint> {
    return 100000n;
  }

  async buildCalls(_params: {
    senderAddress: StarknetAddress;
    calls: readonly StarknetCall[];
  }): Promise<{typedData: unknown; messageHash: string}> {
    return {
      typedData: {mock: true},
      messageHash: `0x${crypto.randomUUID().replaceAll('-', '')}`,
    };
  }

  async executeSignedCalls(_params: {
    senderAddress: StarknetAddress;
    typedData: unknown;
    signature: string[];
  }): Promise<{txHash: string}> {
    return {txHash: `0x${crypto.randomUUID().replaceAll('-', '')}`};
  }
}
