import type {
  DeployTransaction,
  PaymasterGateway,
  PaymasterResult,
  PaymasterTransaction,
  StarknetTransaction,
} from '@bim/domain';
import {ExternalServiceError, StarknetAddress} from '@bim/domain';
import {Account, CallData, hash, RpcProvider, Signer} from 'starknet';
import type {StarkSigner} from './crypto/stark-signer';

/**
 * Pre-funded account structure from starknet-devnet.
 */
export interface DevnetAccount {
  address: string;
  privateKey: string;
  publicKey: string;
}

/**
 * Cached pre-funded accounts from devnet.
 */
let cachedAccounts: DevnetAccount[] | null = null;

/**
 * Fetches pre-funded accounts from starknet-devnet.
 * Supports both old HTTP endpoint and new RPC method.
 */
export async function fetchDevnetAccounts(devnetUrl: string): Promise<DevnetAccount[]> {
  if (cachedAccounts) {
    return cachedAccounts;
  }

  try {
    // Try the new RPC method first (devnet 0.7.x+)
    let rawAccounts: Array<Record<string, unknown>> | null = null;

    const rpcResponse = await fetch(`${devnetUrl}/rpc`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'devnet_getPredeployedAccounts',
        params: [],
        id: 1,
      }),
    });

    if (rpcResponse.ok) {
      const rpcResult = await rpcResponse.json() as {result?: Array<Record<string, unknown>>};
      if (rpcResult.result && Array.isArray(rpcResult.result) && rpcResult.result.length > 0) {
        rawAccounts = rpcResult.result;
      }
    }

    // Fallback to old HTTP endpoint (devnet 0.2.x)
    if (!rawAccounts) {
      const response = await fetch(`${devnetUrl}/predeployed_accounts`);
      if (response.ok) {
        const data = await response.json() as Array<Record<string, unknown>>;
        if (Array.isArray(data) && data.length > 0) {
          rawAccounts = data;
        }
      }
    }

    if (!rawAccounts || rawAccounts.length === 0) {
      throw new Error('No predeployed accounts returned from devnet');
    }

    // Handle various possible field names from different devnet versions
    cachedAccounts = rawAccounts.map(acc => {
      const address = (acc.address || acc.account_address) as string | undefined;
      const privateKey = (acc.private_key || acc.privateKey) as string | undefined;
      const publicKey = (acc.public_key || acc.publicKey) as string | undefined;

      if (!address || !privateKey) {
        console.error('Account object keys:', Object.keys(acc));
        console.error('Full account object:', JSON.stringify(acc));
        throw new Error(`Missing required fields. address: ${address}, privateKey: ${privateKey}`);
      }

      return {
        address,
        privateKey,
        publicKey: publicKey || '',
      };
    });

    return cachedAccounts;
  } catch (error) {
    throw new Error(`Failed to fetch devnet accounts: ${error}`);
  }
}

/**
 * Resets the cached accounts (for testing).
 */
export function resetCachedAccounts(): void {
  cachedAccounts = null;
}

/**
 * Cached account class hash from devnet.
 */
let cachedAccountClassHash: string | null = null;

/**
 * Default account class hash for testing on devnet.
 *
 * This is a fallback value. The actual class hash should be fetched from devnet
 * since different versions use different account classes:
 * - Devnet 0.2.x: 0x61dac032f228abef9c6626f995015233097ae253a7f72d68552db02f2971b8f
 * - Devnet 0.7.x: 0x05b4b537eaa2399e3aa99c4e2e0208ebd6c71bc1467938cd52c798c601e43564
 *
 * Note: In production, the app uses a WebAuthn-enabled account class which would
 * need to be declared separately on the target network.
 */
export const DEVNET_ACCOUNT_CLASS_HASH =
  '0x05b4b537eaa2399e3aa99c4e2e0208ebd6c71bc1467938cd52c798c601e43564';

/**
 * Fetches the account class hash from a pre-deployed devnet account.
 */
export async function fetchDevnetAccountClassHash(devnetUrl: string): Promise<string> {
  if (cachedAccountClassHash) {
    return cachedAccountClassHash;
  }

  const accounts = await fetchDevnetAccounts(devnetUrl);
  if (accounts.length === 0) {
    throw new Error('No pre-deployed accounts available');
  }

  const provider = new RpcProvider({nodeUrl: devnetUrl});
  cachedAccountClassHash = await provider.getClassHashAt(accounts[0].address);

  return cachedAccountClassHash;
}

/**
 * Resets the cached class hash (for testing).
 */
export function resetCachedAccountClassHash(): void {
  cachedAccountClassHash = null;
}

/**
 * Devnet paymaster gateway that simulates AVNU paymaster behavior.
 *
 * Instead of sponsoring gas through AVNU, this gateway:
 * 1. Uses a pre-funded devnet account to deploy/execute transactions
 * 2. For deploy transactions, deploys via UDC (Universal Deployer Contract)
 * 3. For regular transactions, executes directly from the funded account
 *
 * When a P256Signer is provided, it signs DEPLOY_ACCOUNT transactions
 * with the same key used by VirtualAuthenticator, ensuring valid signatures.
 */
export class DevnetPaymasterGateway implements PaymasterGateway {
  private readonly provider: RpcProvider;
  private readonly devnetUrl: string;
  private fundingAccount: Account | null = null;
  private readonly starkSigner?: StarkSigner;
  private lastDeployedAddress?: string;

  constructor(devnetUrl: string, starkSigner?: StarkSigner) {
    this.devnetUrl = devnetUrl;
    this.provider = new RpcProvider({nodeUrl: devnetUrl});
    this.starkSigner = starkSigner;
  }

  /**
   * Gets the address of the last deployed account.
   * This is different from the P256-based address stored in the DB because
   * devnet uses OpenZeppelin account (STARK signatures) not WebAuthn (P256).
   */
  getLastDeployedAddress(): string | undefined {
    return this.lastDeployedAddress;
  }

  /**
   * Gets the expected deployment address for testing.
   * This uses STARK public key, not P256, because devnet uses OpenZeppelin account.
   */
  getExpectedDeploymentAddress(classHash: string): string | undefined {
    if (!this.starkSigner) return undefined;

    const starkPublicKey = this.starkSigner.getPublicKey();
    const compiledCalldata = CallData.compile([starkPublicKey]);
    const salt = starkPublicKey;

    return hash.calculateContractAddressFromHash(
      salt,
      classHash,
      compiledCalldata,
      0
    );
  }

  /**
   * Lazily initializes the funding account.
   */
  private async getFundingAccount(): Promise<Account> {
    if (this.fundingAccount) {
      return this.fundingAccount;
    }

    const accounts = await fetchDevnetAccounts(this.devnetUrl);
    if (accounts.length === 0) {
      throw new Error('No pre-funded accounts available on devnet');
    }

    const funder = accounts[0];
    const addr = funder?.address;
    const pk = funder?.privateKey;

    if (!addr || typeof addr !== 'string') {
      throw new Error(`Invalid address: ${addr} (type: ${typeof addr})`);
    }
    if (!pk || typeof pk !== 'string') {
      throw new Error(`Invalid private key type: ${typeof pk}`);
    }

    const signer = new Signer(pk);
    this.fundingAccount = new Account({
      provider: this.provider,
      address: addr.toLowerCase(),
      signer,
    });

    return this.fundingAccount;
  }

  async executeTransaction(params: {
    transaction: StarknetTransaction | DeployTransaction;
    accountAddress: StarknetAddress;
  }): Promise<PaymasterResult> {
    try {
      if (params.transaction.type === 'DEPLOY_ACCOUNT') {
        return await this.executeDeployTransaction(
          params.transaction as DeployTransaction,
          params.accountAddress
        );
      }
      return await this.executeRegularTransaction(
        params.transaction as StarknetTransaction,
        params.accountAddress
      );
    } catch (error) {
      throw new ExternalServiceError(
        'DevnetPaymaster',
        `Execute failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async executeDeployTransaction(
    _tx: DeployTransaction,
    _accountAddress: StarknetAddress
  ): Promise<PaymasterResult> {
    if (!this.starkSigner) {
      throw new Error('StarkSigner required for devnet deployment');
    }

    // Fetch the actual class hash from devnet
    const classHash = await fetchDevnetAccountClassHash(this.devnetUrl);

    // Use STARK public key for the account (devnet uses OpenZeppelin account, not WebAuthn)
    const starkPublicKey = this.starkSigner.getPublicKey();

    // Calculate address using STARK public key
    const compiledCalldata = CallData.compile([starkPublicKey]);
    const salt = starkPublicKey;

    const starkAddress = hash.calculateContractAddressFromHash(
      salt,
      classHash,
      compiledCalldata,
      0
    );

    // Fund the account with STRK for V3 transactions
    const fundAmount = '10000000000000000000000'; // 10000 STRK
    await this.mintToAddress(starkAddress, fundAmount, 'FRI');

    // Create Account with signer
    const privateKey = this.starkSigner.getPrivateKey();
    const signer = new Signer(privateKey);
    const newAccount = new Account({
      provider: this.provider,
      address: starkAddress,
      signer,
    });

    const deployPayload = {
      classHash: classHash,
      constructorCalldata: [starkPublicKey],
      addressSalt: salt,
    };

    // Resource bounds for V3 transactions on devnet
    // L2 gas must be non-zero for account validation to work
    const resourceBounds = {
      l1_gas: {max_amount: 100000n, max_price_per_unit: 1000000000000000n},
      l2_gas: {max_amount: 1000000n, max_price_per_unit: 1000000000000n},
      l1_data_gas: {max_amount: 10000n, max_price_per_unit: 1000000000000n},
    };

    const result = await newAccount.deployAccount(deployPayload, {resourceBounds});
    await this.provider.waitForTransaction(result.transaction_hash);

    this.lastDeployedAddress = starkAddress;

    return {
      txHash: result.transaction_hash,
      success: true,
    };
  }

  private async executeRegularTransaction(
    tx: StarknetTransaction,
    _accountAddress: StarknetAddress
  ): Promise<PaymasterResult> {
    // For regular transactions, we execute through the funding account
    // This simulates the paymaster executing on behalf of the user
    const fundingAccount = await this.getFundingAccount();
    const result = await fundingAccount.execute(
      {
        contractAddress: tx.contractAddress,
        entrypoint: tx.type,
        calldata: tx.callData,
      },
      {
        // starknet.js v9 requires resourceBounds with l1_gas, l2_gas, and l1_data_gas
        // L2 gas must be non-zero for account validation to work
        resourceBounds: {
          l1_gas: {max_amount: 100000n, max_price_per_unit: 1000000000000000n},
          l2_gas: {max_amount: 1000000n, max_price_per_unit: 1000000000000n},
          l1_data_gas: {max_amount: 10000n, max_price_per_unit: 1000000000000n},
        },
      }
    );

    await this.provider.waitForTransaction(result.transaction_hash);

    return {
      txHash: result.transaction_hash,
      success: true,
    };
  }

  async buildPaymasterTransaction(params: {
    transaction: StarknetTransaction;
    accountAddress: StarknetAddress;
  }): Promise<PaymasterTransaction> {
    // For devnet, we don't need actual sponsor signatures
    // Just return the transaction as-is
    return {
      transaction: params.transaction,
      sponsorSignature: '0x0', // Dummy signature for devnet
      gasToken: undefined,
    };
  }

  async isAvailable(_accountAddress: StarknetAddress): Promise<boolean> {
    // Devnet paymaster is always available
    try {
      // Check if devnet is responsive
      await this.provider.getChainId();
      return true;
    } catch {
      return false;
    }
  }

  async getSponsoredGasLimit(): Promise<bigint> {
    // Return a generous limit for devnet testing
    return BigInt('10000000000000000000'); // 10 ETH
  }

  /**
   * Helper: Fund an address with ETH using devnet's mint endpoint.
   * Supports both old HTTP endpoint and new RPC method.
   */
  async fundAddress(address: StarknetAddress, amount: string = '1000000000000000000'): Promise<string> {
    const addressStr = address.toString();

    // Try new RPC method first (devnet 0.7.x+)
    const rpcResponse = await fetch(`${this.devnetUrl}/rpc`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'devnet_mint',
        params: {address: addressStr, amount: Number(amount), unit: 'WEI'},
        id: 1,
      }),
    });

    if (rpcResponse.ok) {
      const rpcResult = await rpcResponse.json() as {result?: {tx_hash?: string}; error?: {message: string}};
      if (rpcResult.result) {
        return rpcResult.result.tx_hash || '0x0';
      }
    }

    // Fallback to old HTTP endpoint (devnet 0.2.x)
    const response = await fetch(`${this.devnetUrl}/mint`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        address: addressStr,
        amount: Number(amount),
        unit: 'WEI',
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to mint ETH: ${response.status} ${text}`);
    }

    const result = await response.json() as {tx_hash?: string; new_balance?: string};
    return result.tx_hash || '0x0';
  }

  /**
   * Private helper: Mint tokens to an address using devnet's mint endpoint.
   * Supports both old HTTP endpoint and new RPC method.
   * @param address - The address to mint to
   * @param amount - Amount in base units
   * @param unit - 'WEI' for ETH or 'FRI' for STRK
   */
  private async mintToAddress(address: string, amount: string, unit: 'WEI' | 'FRI' = 'WEI'): Promise<void> {
    // Try new RPC method first (devnet 0.7.x+)
    const rpcResponse = await fetch(`${this.devnetUrl}/rpc`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'devnet_mint',
        params: {address, amount: Number(amount), unit},
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
    const response = await fetch(`${this.devnetUrl}/mint`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        address,
        amount: Number(amount),
        unit,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to mint ${unit}: ${response.status} ${text}`);
    }
  }

  /**
   * @deprecated Use mintToAddress with unit parameter
   */
  private async mintEthToAddress(address: string, amount: string): Promise<void> {
    return this.mintToAddress(address, amount, 'WEI');
  }

  /**
   * Helper: Get ETH balance for an address.
   */
  async getEthBalance(address: StarknetAddress): Promise<bigint> {
    const ethAddress = '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7';

    const result = await this.provider.callContract({
      contractAddress: ethAddress,
      entrypoint: 'balanceOf',
      calldata: [address.toString()],
    });

    const low = BigInt(result[0] || '0');
    const high = BigInt(result[1] || '0');

    return low + (high << 128n);
  }
}
