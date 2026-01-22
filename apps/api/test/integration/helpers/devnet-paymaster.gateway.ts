import type {
  DeployTransaction,
  PaymasterGateway,
  PaymasterResult,
  PaymasterTransaction,
  StarknetTransaction,
} from '@bim/domain';
import {ExternalServiceError, StarknetAddress} from '@bim/domain';
import {Account, RpcProvider, Signer} from 'starknet';

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
 */
export async function fetchDevnetAccounts(devnetUrl: string): Promise<DevnetAccount[]> {
  if (cachedAccounts) {
    return cachedAccounts;
  }

  try {
    const response = await fetch(`${devnetUrl}/predeployed_accounts`);
    if (!response.ok) {
      throw new Error(`Failed to fetch accounts: ${response.statusText}`);
    }

    const rawAccounts = await response.json() as Array<Record<string, unknown>>;

    // Debug output
    console.debug('Raw devnet accounts (first):', JSON.stringify(rawAccounts?.[0], null, 2));

    if (!Array.isArray(rawAccounts) || rawAccounts.length === 0) {
      throw new Error('No predeployed accounts returned from devnet');
    }

    // Handle various possible field names from different devnet versions
    cachedAccounts = rawAccounts.map(acc => {
      // Try different possible field names
      const address = (
        acc.address ||
        acc.account_address ||
        (acc.initial_balance ? undefined : undefined) // If this field exists, it's the old format
      ) as string | undefined;

      const privateKey = (
        acc.private_key ||
        acc.privateKey
      ) as string | undefined;

      const publicKey = (
        acc.public_key ||
        acc.publicKey
      ) as string | undefined;

      // Debug if fields are missing
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
 * Default account class hash for Argent accounts on devnet.
 * This is the standard WebAuthn account class hash.
 */
export const DEVNET_ACCOUNT_CLASS_HASH =
  '0x036078334509b514626504edc9fb252328d1a240e4e948bef8d0c08dff45927f';

/**
 * Devnet paymaster gateway that simulates AVNU paymaster behavior.
 *
 * Instead of sponsoring gas through AVNU, this gateway:
 * 1. Uses a pre-funded devnet account to deploy/execute transactions
 * 2. For deploy transactions, deploys via UDC (Universal Deployer Contract)
 * 3. For regular transactions, executes directly from the funded account
 */
export class DevnetPaymasterGateway implements PaymasterGateway {
  private readonly provider: RpcProvider;
  private readonly devnetUrl: string;
  private fundingAccount: Account | null = null;

  constructor(devnetUrl: string) {
    console.log('DevnetPaymasterGateway constructor with URL:', devnetUrl);
    this.devnetUrl = devnetUrl;
    this.provider = new RpcProvider({nodeUrl: devnetUrl});
    console.log('RpcProvider created');
  }

  /**
   * Lazily initializes the funding account.
   */
  private async getFundingAccount(): Promise<Account> {
    console.log('getFundingAccount called, cached:', !!this.fundingAccount);
    if (this.fundingAccount) {
      console.log('Returning cached funding account');
      return this.fundingAccount;
    }

    console.log('Fetching devnet accounts...');
    const accounts = await fetchDevnetAccounts(this.devnetUrl);
    console.log('Got accounts:', accounts.length);
    if (accounts.length === 0) {
      throw new Error('No pre-funded accounts available on devnet');
    }

    const funder = accounts[0];
    const addr = funder?.address;
    const pk = funder?.privateKey;

    console.log('Creating Account - Direct values:', {
      addr: addr,
      addrType: typeof addr,
      pk: pk ? '(exists, type: ' + typeof pk + ')' : '(missing)',
    });

    if (!addr || typeof addr !== 'string') {
      throw new Error(`Invalid address: ${addr} (type: ${typeof addr})`);
    }
    if (!pk || typeof pk !== 'string') {
      throw new Error(`Invalid private key type: ${typeof pk}`);
    }

    // Ensure address is lowercase (starknet.js requirement)
    const normalizedAddr = addr.toLowerCase();

    try {
      // starknet.js v8+ uses object-based constructor with explicit Signer
      const signer = new Signer(pk);
      this.fundingAccount = new Account({
        provider: this.provider,
        address: normalizedAddr,
        signer,
      });
      console.log('Account created successfully');
    } catch (error) {
      console.error('Account creation failed:', error);
      console.error('Constructor args:', {
        provider: !!this.provider,
        address: normalizedAddr,
        pkLength: pk.length,
      });
      throw error;
    }

    return this.fundingAccount;
  }

  async executeTransaction(params: {
    transaction: StarknetTransaction | DeployTransaction;
    accountAddress: StarknetAddress;
  }): Promise<PaymasterResult> {
    console.log('DevnetPaymasterGateway.executeTransaction called');
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
    tx: DeployTransaction,
    accountAddress: StarknetAddress
  ): Promise<PaymasterResult> {
    // For WebAuthn accounts, we need to deploy using DEPLOY_ACCOUNT transaction type
    // The devnet supports direct account deployment
    const deployPayload = {
      classHash: tx.classHash,
      constructorCalldata: tx.constructorCallData,
      addressSalt: tx.constructorCallData[0], // publicKey is used as salt
      contractAddress: tx.contractAddress,
    };

    // First, fund the account using devnet's /mint endpoint
    // This bypasses starknet.js v8 signature compatibility issues
    const fundAmount = '1000000000000000000'; // 1 ETH
    await this.mintEthToAddress(accountAddress.toString(), fundAmount);

    // Now we need to deploy the account
    // For now, we'll use a simpler approach: directly deploy via RPC
    // In production, this would be handled by the paymaster
    const result = await this.provider.deployAccountContract(deployPayload, {
      nonce: 0,
      // starknet.js v8 (RPC 0.8+) requires resourceBounds with l1_gas, l2_gas, and l1_data_gas
      resourceBounds: {
        l1_gas: {max_amount: 2000000n, max_price_per_unit: 100000000000000n},
        l2_gas: {max_amount: 0n, max_price_per_unit: 0n},
        l1_data_gas: {max_amount: 0n, max_price_per_unit: 0n},
      },
    });

    await this.provider.waitForTransaction(result.transaction_hash);

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
        // starknet.js v8 (RPC 0.8+) requires resourceBounds with l1_gas, l2_gas, and l1_data_gas
        resourceBounds: {
          l1_gas: {max_amount: 100000n, max_price_per_unit: 100000000000000n},
          l2_gas: {max_amount: 0n, max_price_per_unit: 0n},
          l1_data_gas: {max_amount: 0n, max_price_per_unit: 0n},
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
   * Helper: Fund an address with ETH using devnet's /mint endpoint.
   * This bypasses transaction signing which has compatibility issues with starknet.js v8.
   */
  async fundAddress(address: StarknetAddress, amount: string = '1000000000000000000'): Promise<string> {
    // Use devnet's /mint endpoint to directly mint ETH to an address
    const response = await fetch(`${this.devnetUrl}/mint`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        address: address.toString(),
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
   * Private helper: Mint ETH to an address using devnet's /mint endpoint.
   */
  private async mintEthToAddress(address: string, amount: string): Promise<void> {
    const response = await fetch(`${this.devnetUrl}/mint`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        address,
        amount: Number(amount),
        unit: 'WEI',
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to mint ETH: ${response.status} ${text}`);
    }
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
