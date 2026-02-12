import {StarknetAddress} from '@bim/domain/account';
import {createLogger} from '@bim/lib/logger';
import {P256Signer} from "@bim/test-toolkit/crypto";
import type {Logger} from "pino";
import {Account, RpcProvider, Signer} from 'starknet';
import {StarknetRpcGateway} from '../../../src/adapters';
import {StarkSigner} from './crypto';
import {
  DEVNET_ACCOUNT_CLASS_HASH,
  DevnetPaymasterGateway,
  fetchDevnetAccounts,
  resetCachedAccountClassHash,
  resetCachedAccounts,
} from './devnet-paymaster.gateway.js';
import {StrkDevnet} from "./strk-devnet";

/**
 * ETH token address on Starknet (smart contract address)
 */
export const ETH_TOKEN_ADDRESS = '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7';

/**
 * STRK token address on Starknet.
 */
export const STRK_TOKEN_ADDRESS = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';

/**
 * WBTC token address on Starknet Sepolia.
 */
export const WBTC_TOKEN_ADDRESS = '0x00abbd7d98ad664568f204d6e1af6e02d6a5c55eb4e83c9fbbfc3ed8514efc09';

export class StrkDevnetContext {

  private readonly devnetProvider: RpcProvider;
  private readonly starknetGateway: StarknetRpcGateway;
  private paymasterGateway: DevnetPaymasterGateway;
  private readonly p256Signer: P256Signer;
  private starkSigner: StarkSigner | null = null;
  private readonly devnetUrl: string;
  private starkSignerInitialized = false;
  private readonly logger: Logger;

  private constructor() {
    this.devnetUrl = StrkDevnet.getDevnetUrl();
    this.devnetProvider = new RpcProvider({nodeUrl: this.devnetUrl});
    // Create the paymaster gateway without StarkSigner initially
    // It will be updated when ensureStarkSignerInitialized is called
    this.paymasterGateway = new DevnetPaymasterGateway(this.devnetUrl);

    this.logger = createLogger();
    this.starknetGateway = new StarknetRpcGateway(
      {
        rpcUrl: this.devnetUrl,
        accountClassHash: DEVNET_ACCOUNT_CLASS_HASH,
        tokenAddresses: {
          WBTC: WBTC_TOKEN_ADDRESS,
        },
        webauthnOrigin: 'http://localhost:8080',
        webauthnRpId: 'localhost',
      },
      this.paymasterGateway,
      this.logger,
    );

    // Use shared P256Signer for WebAuthn credential testing
    this.p256Signer = P256Signer.generate();
  }

  static create(): StrkDevnetContext {
    return new StrkDevnetContext();
  }

  /**
   * Ensures the StarkSigner is initialized with a devnet account's private key.
   * Call this in beforeAll() for tests that need STARK signing (deployment tests).
   * @param accountIndex - Index of the devnet account to use (default: 1, since 0 is for funding)
   */
  async ensureStarkSignerInitialized(accountIndex: number = 1): Promise<void> {
    if (this.starkSignerInitialized) return;

    // Fetch a devnet account's private key for the StarkSigner
    const accounts = await fetchDevnetAccounts(this.devnetUrl);
    // Use the specified account index (default: 1 since account 0 is used for funding)
    const account = accounts[accountIndex];
    if (!account?.privateKey) {
      throw new Error(`No devnet account with private key available at index ${accountIndex}`);
    }

    // Initialize the shared StarkSigner with the devnet account's key
    // setSharedStarkSigner(account.privateKey);
    this.starkSigner = StarkSigner.create(account.privateKey);

    // Recreate paymaster gateway with the StarkSigner
    this.paymasterGateway = new DevnetPaymasterGateway(this.devnetUrl, this.starkSigner);
    this.starkSignerInitialized = true;
  }

  /**
   * Resets all cached gateways. Call in afterEach if needed.
   */
  resetStarknetContext(): void {
    resetCachedAccounts();
    resetCachedAccountClassHash();
  }

  /**
   * Gets the shared P256Signer for use with VirtualAuthenticator.
   * This is used for WebAuthn credential creation/verification.
   */
  getP256Signer(): P256Signer {
    return this.p256Signer;
  }

  /**
   * Gets the shared StarkSigner for devnet deployment.
   * Devnet uses OpenZeppelin account (STARK signatures), not WebAuthn (P256).
   * NOTE: Must call ensureStarkSignerInitialized() before using this in tests.
   */
  getStarkSigner(): StarkSigner | null {
    return this.starkSigner;
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
   * NOTE: For deployment tests, call ensureStarkSignerInitialized() first to enable signing.
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
      this.logger.warn(error,'Failed to reset devnet:');
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
   * Uses devnet mint endpoint with unit: WEI.
   */
  async mintEth(address: string, amountWei: string): Promise<void> {
    const devnetUrl = StrkDevnet.getDevnetUrl();

    // Try new RPC method first (devnet 0.7.x+)
    const rpcResponse = await fetch(`${devnetUrl}/rpc`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'devnet_mint',
        params: {address, amount: Number(amountWei), unit: 'WEI'},
        id: 1,
      }),
    });

    if (rpcResponse.ok) {
      const result = await rpcResponse.json() as {error?: {message: string}};
      if (!result.error) {
        return;
      }
    }

    // Fallback to old HTTP endpoint (devnet 0.2.x)
    await fetch(`${devnetUrl}/mint`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        address,
        amount: Number.parseInt(amountWei),
        unit: 'WEI',
      }),
    });
  }

  /**
   * Creates a starknet.js Account instance from a pre-deployed devnet account.
   * @param accountIndex - Index of the pre-deployed account (0, 1, or 2)
   */
  async createAccountFromPredeployed(accountIndex: number): Promise<Account> {
    const accounts = await fetchDevnetAccounts(this.devnetUrl);
    if (accountIndex >= accounts.length) {
      throw new Error(`Account index ${accountIndex} out of range (max: ${accounts.length - 1})`);
    }
    const account = accounts[accountIndex];
    return new Account({
      provider: this.devnetProvider,
      address: account.address,
      signer: new Signer(account.privateKey),
    });
  }

  /**
   * Resource bounds for devnet transactions (skips slow fee estimation).
   * L2 gas needs to be high enough for ERC20 transfers (~1.2M gas).
   */
  private static readonly DEVNET_RESOURCE_BOUNDS = {
    l1_gas: {max_amount: 100000n, max_price_per_unit: 1000000000000000n},
    l2_gas: {max_amount: 5000000n, max_price_per_unit: 1000000000000n},
    l1_data_gas: {max_amount: 100000n, max_price_per_unit: 1000000000000n},
  };

  /**
   * Transfers ETH from one account to another.
   * @param from - Source Account instance
   * @param toAddress - Destination address
   * @param amountWei - Amount in wei (string)
   * @param skipFeeEstimation - If true, uses explicit resourceBounds (faster)
   * @returns Transaction hash
   */
  async transferEth(
    from: Account,
    toAddress: string,
    amountWei: string,
    skipFeeEstimation = true,
  ): Promise<string> {
    const call = {
      contractAddress: ETH_TOKEN_ADDRESS,
      entrypoint: 'transfer',
      calldata: [toAddress, amountWei, '0'], // the amount is u256 (low, high)
    };
    try {
      const options = skipFeeEstimation
        ? {resourceBounds: StrkDevnetContext.DEVNET_RESOURCE_BOUNDS}
        : undefined;
      const result = await from.execute(call, options);
      this.logger.info(`ETH transfer tx: ${result.transaction_hash}`);
      const receipt = await this.devnetProvider.waitForTransaction(result.transaction_hash);
      this.logger.info(`ETH transfer receipt: ${JSON.stringify(receipt, null, 2)}`);
      return result.transaction_hash;
    } catch (error) {
      this.logger.error(error, 'ETH transfer error:');
      throw error;
    }
  }

  /**
   * Transfers STRK from one account to another.
   * @param from - Source Account instance
   * @param toAddress - Destination address
   * @param amountFri - Amount in fri (string)
   * @param skipFeeEstimation - If true, uses explicit resourceBounds (faster)
   * @returns Transaction hash
   */
  async transferStrk(
    from: Account,
    toAddress: string,
    amountFri: string,
    skipFeeEstimation = true,
  ): Promise<string> {
    const call = {
      contractAddress: STRK_TOKEN_ADDRESS,
      entrypoint: 'transfer',
      calldata: [toAddress, amountFri, '0'], // the amount is u256 (low, high)
    };
    const options = skipFeeEstimation
      ? {resourceBounds: StrkDevnetContext.DEVNET_RESOURCE_BOUNDS}
      : undefined;
    const result = await from.execute(call, options);
    await this.devnetProvider.waitForTransaction(result.transaction_hash);
    return result.transaction_hash;
  }

  /**
   * Gets the STRK balance for an address.
   */
  async getStrkBalance(address: string | StarknetAddress): Promise<bigint> {
    const result = await this.devnetProvider.callContract({
      contractAddress: STRK_TOKEN_ADDRESS,
      entrypoint: 'balanceOf',
      calldata: [address],
    });
    const low = BigInt(result[0] || '0');
    const high = BigInt(result[1] || '0');
    return low + (high << 128n);
  }

  /**
   * Executes a multicall transaction on Starknet.
   *
   * This is a generic infrastructure method that executes an array of calls
   * in a single transaction. Business logic (like fee calculation) should be
   * handled by domain services, not here.
   *
   * @param from - Source Account instance
   * @param calls - Array of Starknet calls to execute
   * @param skipFeeEstimation - If true, uses explicit resourceBounds (faster)
   * @returns Transaction hash
   */
  async executeMulticall(
    from: Account,
    calls: ReadonlyArray<{
      readonly contractAddress: string;
      readonly entrypoint: string;
      readonly calldata: readonly string[];
    }>,
    skipFeeEstimation = true,
  ): Promise<string> {
    const options = skipFeeEstimation
      ? {resourceBounds: StrkDevnetContext.DEVNET_RESOURCE_BOUNDS}
      : undefined;

    // Convert readonly array to mutable for starknet.js compatibility
    const mutableCalls = calls.map((call) => ({
      contractAddress: call.contractAddress,
      entrypoint: call.entrypoint,
      calldata: [...call.calldata],
    }));

    const result = await from.execute(mutableCalls, options);
    await this.devnetProvider.waitForTransaction(result.transaction_hash);
    return result.transaction_hash;
  }

}
