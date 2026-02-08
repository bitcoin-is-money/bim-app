import {RpcProvider} from 'starknet';

/**
 * Testnet context — provides Sepolia RPC utilities for on-chain verification.
 *
 * All configuration comes from .env.testnet (loaded by global-setup.ts).
 *
 * Unlike StrkDevnetContext (which manages a local devnet container),
 * this context connects to the real Starknet Sepolia network.
 * It is used to verify on-chain state after API operations (deployment, transfers).
 */
export class TestnetContext {
  private readonly provider: RpcProvider;

  constructor() {
    const rpcUrl = process.env.STARKNET_RPC_URL;
    if (!rpcUrl) {
      throw new Error('STARKNET_RPC_URL not set — is .env.testnet loaded?');
    }
    this.provider = new RpcProvider({nodeUrl: rpcUrl});
  }

  /**
   * Returns the Sepolia RPC provider for direct queries.
   */
  getSepoliaProvider(): RpcProvider {
    return this.provider;
  }

  /**
   * Waits for a transaction to be confirmed on Sepolia.
   * Sepolia blocks are ~15-30s, so this may take a while.
   */
  async waitForTransaction(txHash: string): Promise<void> {
    await this.provider.waitForTransaction(txHash);
  }

  /**
   * Checks if a contract is deployed at the given address.
   * Returns true if a class hash is found (non-zero).
   */
  async isAccountDeployed(address: string): Promise<boolean> {
    try {
      const classHash = await this.provider.getClassHashAt(address);
      return !!classHash && classHash !== '0x0';
    } catch {
      return false;
    }
  }

  /**
   * Gets the class hash of the contract deployed at the given address.
   * Returns null if no contract is deployed.
   */
  async getClassHashAt(address: string): Promise<string | null> {
    try {
      const classHash = await this.provider.getClassHashAt(address);
      return classHash && classHash !== '0x0' ? classHash : null;
    } catch {
      return null;
    }
  }

  /**
   * Returns the expected BIM Argent class hash from env config.
   */
  getBimClassHash(): string {
    const classHash = process.env.ACCOUNT_CLASS_HASH;
    if (!classHash) {
      throw new Error('ACCOUNT_CLASS_HASH not set — is .env.testnet loaded?');
    }
    return classHash;
  }
}
