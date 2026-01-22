import {StarknetAddress} from '@bim/domain';
import {RpcProvider} from 'starknet';
import {StarknetRpcGateway} from '../../../src/adapters/gateways/starknet.gateway.js';
import {
  DEVNET_ACCOUNT_CLASS_HASH,
  DevnetPaymasterGateway,
  fetchDevnetAccounts,
  resetCachedAccounts,
} from './devnet-paymaster.gateway.js';
import {StrkDevnet} from "./strk-devnet";


/**
 * ETH token address on Starknet.
 */
export const ETH_TOKEN_ADDRESS = '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7';

/**
 * STRK token address on Starknet.
 */
export const STRK_TOKEN_ADDRESS = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';


export class StrkDevnetContext {

  private readonly devnetProvider: RpcProvider;
  private readonly starknetGateway: StarknetRpcGateway;
  private readonly paymasterGateway: DevnetPaymasterGateway;
  private paymasterGatewayId = 0;

  private constructor() {
    const devnetUrl: string = StrkDevnet.getDevnetUrl();
    this.devnetProvider = new RpcProvider({nodeUrl: devnetUrl});
    this.starknetGateway = new StarknetRpcGateway({
      rpcUrl: devnetUrl,
      accountClassHash: DEVNET_ACCOUNT_CLASS_HASH,
    });

    this.paymasterGateway = new DevnetPaymasterGateway(devnetUrl);
  }

  static create(): StrkDevnetContext {
    return new StrkDevnetContext();
  }

  /**
   * Resets all cached gateways. Call in afterEach if needed.
   */
  resetStarknetContext(): void {
    resetCachedAccounts();
  }

  /**
   * Gets a Starknet RPC devnetProvider connected to devnet.
   */
  getDevnetProvider(): RpcProvider {
    return this.devnetProvider;
  }

  /**
   * Gets the Starknet gateway configured for devnet.
   */
  getStarknetGateway(): StarknetRpcGateway {
    return this.starknetGateway;
  }

  /**
   * Gets the devnet paymaster gateway.
   */
  getDevnetPaymasterGateway(): DevnetPaymasterGateway {
    return this.paymasterGateway;
  }

  /**
   * Waits for a transaction to be confirmed.
   */
  async waitForTransaction(txHash: string): Promise<void> {
    await this.devnetProvider.waitForTransaction(txHash);
  }

  /**
   * Checks if an account is deployed (has code).
   */
  async isAccountDeployed(address: StarknetAddress): Promise<boolean> {
    try {
      const classHash = await this.devnetProvider.getClassHashAt(address);
      return !!classHash && classHash !== '0x0';
    } catch {
      return false;
    }
  }

  /**
   * Gets the pre-deployed devnet accounts.
   */
  async getPredeployedAccounts() {
    return fetchDevnetAccounts(StrkDevnet.getDevnetUrl());
  }

  /**
   * Gets the first pre-deployed account (used for funding).
   */
  async getFundingAccount() {
    const accounts = await fetchDevnetAccounts(StrkDevnet.getDevnetUrl());
    return accounts[0];
  }

  /**
   * Generates a valid Starknet public key for testing.
   * Returns a hex string that's a valid Stark field element (< STARK_PRIME).
   * The Stark prime is ~2^251, so we generate 31 random bytes padded to 64 hex chars.
   */
  generateTestPublicKey(): string {
    // Generate 31 bytes to ensure the value is < 2^251 (Stark field limit)
    const randomBytes = new Uint8Array(31);
    crypto.getRandomValues(randomBytes);

    // Convert to hex, ensuring it's a valid field element
    const hex = Array.from(randomBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Pad to 64 characters (32 bytes) with leading zeros
    return '0x' + hex.padStart(64, '0');
  }

  /**
   * Gets the account class hash for devnet.
   */
  getAccountClassHash(): string {
    return DEVNET_ACCOUNT_CLASS_HASH;
  }

  /**
   * Funds an address with ETH.
   */
  async fundAddress(
    address: string | StarknetAddress,
    amountWei: string = '1000000000000000000'
  ): Promise<string> {
    const normalizedAddress = typeof address === 'string'
      ? StarknetAddress.of(address)
      : address;
    return this.paymasterGateway.fundAddress(normalizedAddress, amountWei);
  }

  /**
   * Gets the ETH balance for an address.
   */
  async getEthBalance(address: string | StarknetAddress): Promise<bigint> {
    const normalizedAddress = typeof address === 'string'
      ? StarknetAddress.of(address)
      : address;
    return this.paymasterGateway.getEthBalance(normalizedAddress);
  }

  /**
   * Calculates the account address for a given public key.
   */
  async calculateAccountAddress(publicKey: string): Promise<StarknetAddress> {
    return this.starknetGateway.calculateAccountAddress({publicKey});
  }

  /**
   * Resets the devnet to the initial state.
   * Useful for test isolation.
   */
  async resetDevnet(): Promise<void> {
    const devnetUrl = StrkDevnet.getDevnetUrl();
    try {
      await fetch(`${devnetUrl}/restart`, {method: 'POST'});
      // Wait a bit for devnet to restart
      await new Promise(resolve => setTimeout(resolve, 500));
      this.resetStarknetContext();
    } catch (error) {
      console.warn('Failed to reset devnet:', error);
    }
  }

  /**
   * Gets the current block number.
   */
  async getCurrentBlock(): Promise<number> {
    const block = await this.devnetProvider.getBlockLatestAccepted();
    return block.block_number;
  }

  /**
   * Mints ETH to an address (devnet-specific).
   */
  async mintEth(address: string, amountWei: string): Promise<void> {
    const devnetUrl = StrkDevnet.getDevnetUrl();
    await fetch(`${devnetUrl}/mint`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        address,
        amount: Number.parseInt(amountWei),
      }),
    });
  }

}
