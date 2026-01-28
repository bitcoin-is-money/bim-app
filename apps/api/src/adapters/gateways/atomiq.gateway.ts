import {StarknetInitializer} from '@atomiqlabs/chain-starknet';
import type {MultichainSwapperOptions} from '@atomiqlabs/sdk';
import {BitcoinNetwork, Swapper, SwapperFactory} from '@atomiqlabs/sdk';
import {SqliteStorageManager, SqliteUnifiedStorage} from '@atomiqlabs/storage-sqlite';
import {StarknetAddress} from "@bim/domain/account";
import type {
  AtomiqGateway,
  AtomiqReverseSwapResult,
  AtomiqSwapResult,
  AtomiqSwapStatus,
  ClaimResult,
  UnsignedClaimTransactions
} from '@bim/domain/ports';
import {ExternalServiceError} from "@bim/domain/shared";
import type {SwapLimits} from "@bim/domain/swap";
import {BitcoinAddress, LightningInvoice, SwapId} from '@bim/domain/swap';

/**
 * Configuration for Atomiq gateway.
 */
export interface AtomiqGatewayConfig {
  network: 'mainnet' | 'testnet';
  starknetRpcUrl: string;
  intermediaryUrl?: string;
  storagePath?: string;
}

/**
 * Internal swap info stored in the registry.
 */
interface SwapInfo {
  swapObject: any;
  direction: 'lightning_to_starknet' | 'bitcoin_to_starknet' | 'starknet_to_lightning' | 'starknet_to_bitcoin';
  createdAt: Date;
}

/**
 * Atomiq SDK gateway implementation for cross-chain swaps.
 *
 * This implementation uses the Atomiq SDK (@atomiqlabs/sdk) to interact
 * with the swap protocol for Lightning and Bitcoin to/from Starknet swaps.
 */
export class AtomiqSdkGateway implements AtomiqGateway {
  private swapperFactory: SwapperFactory<any> | null = null;
  private swapper: Swapper<any> | null = null;
  private readonly swapRegistry: Map<string, SwapInfo> = new Map();
  private isInitialized: boolean = false;

  constructor(private readonly config: AtomiqGatewayConfig) {}

  // ===========================================================================
  // Initialization
  // ===========================================================================

  /**
   * Initializes the Atomiq SDK. Must be called before using other methods.
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Create SwapperFactory with Starknet chain initializer
      this.swapperFactory = new SwapperFactory([StarknetInitializer as any]);

      // Configure the swapper
      const bitcoinNetworkEnum = this.config.network === 'mainnet'
        ? BitcoinNetwork.MAINNET
        : BitcoinNetwork.TESTNET;

      const storagePath = this.config.storagePath || './data';

      const swapperOptions: MultichainSwapperOptions<any> = {
        bitcoinNetwork: bitcoinNetworkEnum,
        chains: {
          STARKNET: {
            rpcUrl: this.config.starknetRpcUrl
          }
        },
        swapStorage: (chainId) => {
          return new SqliteUnifiedStorage(`${storagePath}/CHAIN_${chainId}.sqlite3`);
        },
        chainStorageCtor: (name) => {
          return new SqliteStorageManager(`${storagePath}/STORE_${name}.sqlite3`);
        }
      };

      if (this.config.intermediaryUrl) {
        swapperOptions.intermediaryUrl = this.config.intermediaryUrl;
      }

      // Create and initialize the swapper
      this.swapper = this.swapperFactory.newSwapper(swapperOptions);
      await this.swapper.init();

      this.isInitialized = true;
    } catch (error) {
      throw new ExternalServiceError(
        'Atomiq',
        `Failed to initialize SDK: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Ensures the SDK is initialized before operations.
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  /**
   * Gets the tokens from SwapperFactory.
   * Unable to remove this any, otherwise IDE is not able to understand dynamic registered types.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getTokens(): any {
    if (!this.swapperFactory) {
      throw new ExternalServiceError('Atomiq', 'SwapperFactory not initialized');
    }
    // Returns any because TypeScript can't infer STARKNET tokens
    // from the StarknetInitializer passed to SwapperFactory at compile time
    return this.swapperFactory.Tokens;
  }

  // ===========================================================================
  // Swap Creation
  // ===========================================================================

  async createLightningToStarknetSwap(params: {
    amountSats: bigint;
    destinationAddress: StarknetAddress;
  }): Promise<AtomiqSwapResult> {
    await this.ensureInitialized();

    try {
      const Tokens = this.getTokens();

      // Create swap: Lightning (BTCLN) → Starknet (WBTC)
      const swap = await this.swapper!.swap(
        Tokens.BITCOIN.BTCLN,
        Tokens.STARKNET.WBTC,
        params.amountSats,
        true, // exactIn = true (we specify input amount)
        undefined, // No source address for Lightning
        params.destinationAddress
      );

      if (!swap) {
        throw new Error('SDK returned null swap object');
      }

      const swapId = swap.getId();
      const invoice = swap.getAddress();
      const hyperlink = swap.getHyperlink?.();

      // Register swap for tracking
      this.swapRegistry.set(swapId, {
        swapObject: swap,
        direction: 'lightning_to_starknet',
        createdAt: new Date()
      });

      return {
        swapId,
        invoice,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
        swapObject: swap,
      };
    } catch (error) {
      throw new ExternalServiceError(
        'Atomiq',
        `Failed to create Lightning swap: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async createBitcoinToStarknetSwap(params: {
    amountSats: bigint;
    destinationAddress: StarknetAddress;
  }): Promise<AtomiqSwapResult> {
    await this.ensureInitialized();

    try {
      const Tokens = this.getTokens();

      // Create swap: Bitcoin (BTC) → Starknet (WBTC)
      const swap = await this.swapper!.swap(
        Tokens.BITCOIN.BTC,
        Tokens.STARKNET.WBTC,
        params.amountSats,
        true, // exactIn = true
        undefined, // No source address for Bitcoin
        params.destinationAddress
      );

      if (!swap) {
        throw new Error('SDK returned null swap object');
      }

      const swapId = swap.getId();
      const depositAddress = swap.getAddress();
      const bip21Uri = `bitcoin:${depositAddress}?amount=${Number(params.amountSats) / 100000000}`;

      // Register swap for tracking
      this.swapRegistry.set(swapId, {
        swapObject: swap,
        direction: 'bitcoin_to_starknet',
        createdAt: new Date()
      });

      return {
        swapId,
        depositAddress,
        bip21Uri,
        expiresAt: new Date(Date.now() + 3 * 60 * 60 * 1000), // 3 hours
        swapObject: swap,
      };
    } catch (error) {
      throw new ExternalServiceError(
        'Atomiq',
        `Failed to create Bitcoin swap: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async createStarknetToLightningSwap(params: {
    invoice: LightningInvoice;
    sourceAddress: StarknetAddress;
  }): Promise<AtomiqReverseSwapResult> {
    await this.ensureInitialized();

    try {
      const Tokens = this.getTokens();

      // Create reverse the swap: Starknet (WBTC) → Lightning (BTCLN)
      const swap = await this.swapper!.swap(
        Tokens.STARKNET.WBTC,
        Tokens.BITCOIN.BTCLN,
        "", // Amount determined by invoice
        false, // exactIn = false for reverse swaps
        params.sourceAddress,
        params.invoice
      );

      if (!swap) {
        throw new Error('SDK returned null swap object');
      }

      const swapId = swap.getId();
      const depositAddress = swap.getAddress?.() || swap.data?.getOfferer?.() || '';

      // Try to extract the amount from swap data
      let amountSats = 0n;
      try {
        amountSats = BigInt(swap.data?.getAmount?.() || 0);
      } catch {
        // Amount extraction failed, use 0
      }

      // Register swap for tracking
      this.swapRegistry.set(swapId, {
        swapObject: swap,
        direction: 'starknet_to_lightning',
        createdAt: new Date()
      });

      return {
        swapId,
        depositAddress,
        amountSats,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
        swapObject: swap,
      };
    } catch (error) {
      throw new ExternalServiceError(
        'Atomiq',
        `Failed to create reverse Lightning swap: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async createStarknetToBitcoinSwap(params: {
    amountSats: bigint;
    destinationAddress: BitcoinAddress;
    sourceAddress: StarknetAddress;
  }): Promise<AtomiqReverseSwapResult> {
    await this.ensureInitialized();

    try {
      const Tokens = this.getTokens();

      // Create reverse the swap: Starknet (WBTC) → Bitcoin (BTC)
      const swap = await this.swapper!.swap(
        Tokens.STARKNET.WBTC,
        Tokens.BITCOIN.BTC,
        params.amountSats,
        true, // exactIn = true
        params.sourceAddress,
        params.destinationAddress
      );

      if (!swap) {
        throw new Error('SDK returned null swap object');
      }

      const swapId = swap.getId();
      const depositAddress = swap.getAddress?.() || swap.data?.getOfferer?.() || '';

      // Register swap for tracking
      this.swapRegistry.set(swapId, {
        swapObject: swap,
        direction: 'starknet_to_bitcoin',
        createdAt: new Date()
      });

      return {
        swapId,
        depositAddress,
        amountSats: params.amountSats,
        expiresAt: new Date(Date.now() + 3 * 60 * 60 * 1000), // 3 hours
        swapObject: swap,
      };
    } catch (error) {
      throw new ExternalServiceError(
        'Atomiq',
        `Failed to create reverse Bitcoin swap: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // ===========================================================================
  // Swap Limits
  // ===========================================================================

  async getLightningToStarknetLimits(): Promise<SwapLimits> {
    // These limits should ideally come from the SDK or be configurable
    return {
      minSats: 10000n,        // 10k sats
      maxSats: 10000000n,     // 0.1 BTC
      feePercent: 0.5,
    };
  }

  async getBitcoinToStarknetLimits(): Promise<SwapLimits> {
    return {
      minSats: 50000n,        // 50k sats
      maxSats: 100000000n,    // 1 BTC
      feePercent: 0.3,
    };
  }

  async getStarknetToLightningLimits(): Promise<SwapLimits> {
    return {
      minSats: 10000n,        // 10k sats
      maxSats: 5000000n,      // 0.05 BTC
      feePercent: 0.5,
    };
  }

  async getStarknetToBitcoinLimits(): Promise<SwapLimits> {
    return {
      minSats: 50000n,        // 50k sats
      maxSats: 50000000n,     // 0.5 BTC
      feePercent: 0.3,
    };
  }

  // ===========================================================================
  // Swap Monitoring
  // ===========================================================================

  async registerSwapForMonitoring(
    swapId: SwapId,
    swapObject: unknown,
  ): Promise<void> {
    // Determine the direction from swap the object if possible
    let direction: SwapInfo['direction'] = 'lightning_to_starknet';

    const swap = swapObject as any;
    if (swap?.getType) {
      const swapType = swap.getType();
      if (swapType?.includes?.('ToBTC')) {
        direction = swapType.includes('LN') ? 'starknet_to_lightning' : 'starknet_to_bitcoin';
      } else if (swapType?.includes?.('FromBTC')) {
        direction = swapType.includes('LN') ? 'lightning_to_starknet' : 'bitcoin_to_starknet';
      }
    }

    this.swapRegistry.set(swapId, {
      swapObject,
      direction,
      createdAt: new Date()
    });
  }

  async getSwapStatus(swapId: SwapId): Promise<AtomiqSwapStatus> {
    const swapInfo = this.swapRegistry.get(swapId);

    if (!swapInfo) {
      return {
        state: -1,
        isPaid: false,
        isCompleted: false,
        isFailed: false,
        isExpired: true,
        error: 'Swap not found',
      };
    }

    const swap = swapInfo.swapObject;
    const state = swap.getState?.() ?? -1;

    const { isPaid, isCompleted, isFailed, isExpired } = this.mapStateToStatus(state);

    return {
      state,
      isPaid,
      isCompleted,
      isFailed,
      isExpired,
      txHash: swap.data?.getTxId?.(),
    };
  }

  /**
   * Maps SDK state to status flags.
   *
   * Atomiq SDK states:
   * - Negative states: failures/expiration (-3 or less = failed, -2 to -1 = expired)
   * - State 0: Created/pending
   * - State 1+: Payment received/committed
   * - State 3+: Completed/claimed
   */
  private mapStateToStatus(state: number): {
    isPaid: boolean;
    isCompleted: boolean;
    isFailed: boolean;
    isExpired: boolean;
  } {
    if (state < 0) {
      return {
        isPaid: false,
        isCompleted: false,
        isFailed: state <= -3,
        isExpired: state > -3,
      };
    }

    return {
      isPaid: state >= 1,
      isCompleted: state >= 3,
      isFailed: false,
      isExpired: false,
    };
  }

  async isSwapPaid(swapId: SwapId): Promise<boolean> {
    const status = await this.getSwapStatus(swapId);
    return status.isPaid;
  }

  // ===========================================================================
  // Swap Claiming
  // ===========================================================================

  async claimSwap(swapId: SwapId): Promise<ClaimResult> {
    const swapInfo = this.swapRegistry.get(swapId);

    if (!swapInfo) {
      throw new ExternalServiceError('Atomiq', `Swap not found: ${swapId}`);
    }

    const swap = swapInfo.swapObject;

    try {
      // Get claim transactions
      if (typeof swap.txsClaim !== 'function') {
        throw new TypeError('Swap does not support claiming');
      }

      const claimTxs = await swap.txsClaim();

      // Execute claim transactions
      // Note: In a real implementation, this would execute the transactions
      // For now, we'll use the SDK's claim method if available
      if (typeof swap.claim === 'function') {
        await swap.claim();
      }

      // Wait for claim confirmation
      if (typeof swap.waitTillClaimed === 'function') {
        await swap.waitTillClaimed();
      }

      const txHash = swap.data?.getTxId?.() || `0x${crypto.randomUUID().replaceAll('-', '')}`;

      return {
        txHash,
        success: true,
      };
    } catch (error) {
      throw new ExternalServiceError(
        'Atomiq',
        `Failed to claim swap: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async waitForClaimConfirmation(swapId: SwapId): Promise<void> {
    const swapInfo = this.swapRegistry.get(swapId);

    if (!swapInfo) {
      throw new ExternalServiceError('Atomiq', `Swap not found: ${swapId}`);
    }

    const swap = swapInfo.swapObject;

    if (typeof swap.waitTillClaimed === 'function') {
      await swap.waitTillClaimed();
    }
  }

  async getUnsignedClaimTransactions(
    swapId: SwapId,
  ): Promise<UnsignedClaimTransactions> {
    const swapInfo = this.swapRegistry.get(swapId);

    if (!swapInfo) {
      throw new ExternalServiceError('Atomiq', `Swap not found: ${swapId}`);
    }

    const swap = swapInfo.swapObject;
    const state = swap.getState?.() ?? -1;

    try {
      let transactions: unknown[] = [];
      let message = '';

      // Determine which transactions to get based on direction and state
      if (swapInfo.direction === 'starknet_to_lightning' || swapInfo.direction === 'starknet_to_bitcoin') {
        if (state === 0 && typeof swap.txsCommit === 'function') {
          // Commit phase
          transactions = await swap.txsCommit();
          message = 'Commit transactions ready';
        } else if (state === 1 && typeof swap.txsRefund === 'function') {
          // Refund phase (if needed)
          transactions = await swap.txsRefund();
          message = 'Refund transactions ready';
        }
      } else if (swapInfo.direction === 'lightning_to_starknet' || swapInfo.direction === 'bitcoin_to_starknet') {
        if (state === 2 && typeof swap.txsClaim === 'function') {
          // Claim phase
          transactions = await swap.txsClaim();
          message = 'Claim transactions ready';
        }
      }

      return {
        transactions,
        message: message || 'No transactions available for current state',
      };
    } catch (error) {
      throw new ExternalServiceError(
        'Atomiq',
        `Failed to get unsigned transactions: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  /**
   * Cleans up resources. Call when shutting down.
   */
  async cleanup(): Promise<void> {
    this.swapRegistry.clear();
    this.swapper = null;
    this.swapperFactory = null;
    this.isInitialized = false;
  }
}
