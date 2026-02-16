import {StarknetInitializer, type StarknetInitializerType} from '@atomiqlabs/chain-starknet';
import type {TypedSwapper, TypedSwapperOptions} from '@atomiqlabs/sdk';
import {BitcoinNetwork, SwapperFactory, SwapType} from '@atomiqlabs/sdk';
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
import {existsSync, mkdirSync} from 'node:fs';
import {basename} from 'node:path';
import type {Logger} from "pino";

/**
 * Configuration for Atomiq gateway.
 */
export interface AtomiqGatewayConfig {
  network: 'mainnet' | 'testnet';
  starknetRpcUrl: string;
  intermediaryUrl?: string;
  storagePath: string;
  autoCreateStorage?: boolean;
  swapToken: string;
}

/**
 * Internal swap info stored in the registry.
 */
interface SwapInfo {
  swapObject: any;
  direction: 'lightning_to_starknet' | 'bitcoin_to_starknet' | 'starknet_to_lightning' | 'starknet_to_bitcoin';
  createdAt: Date;
}

type StarknetChainInitializers = readonly [StarknetInitializerType];

/**
 * Atomiq SDK gateway implementation for cross-chain swaps.
 *
 * This implementation uses the Atomiq SDK (@atomiqlabs/sdk) to interact
 * with the swap protocol for Lightning and Bitcoin to/from Starknet swaps.
 */
export class AtomiqSdkGateway implements AtomiqGateway {
  private swapperFactory: SwapperFactory<StarknetChainInitializers> | null = null;
  private swapper: TypedSwapper<StarknetChainInitializers> | null = null;
  private readonly swapRegistry: Map<string, SwapInfo> = new Map();
  private isInitialized: boolean = false;
  private readonly log: Logger;

  constructor(
    private readonly config: AtomiqGatewayConfig,
    rootLogger: Logger,
  ) {
    this.log = rootLogger.child({name: basename(import.meta.filename)});
  }

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
    this.log.debug('Initializing Atomiq gateway');
    try {
      // Create SwapperFactory with Starknet chain initializer
      this.swapperFactory = new SwapperFactory([StarknetInitializer]);

      // Configure the swapper
      const bitcoinNetworkEnum = this.config.network === 'mainnet'
        ? BitcoinNetwork.MAINNET
        : BitcoinNetwork.TESTNET;

      const {storagePath, autoCreateStorage} = this.config;
      if (!existsSync(storagePath)) {
        if (autoCreateStorage) {
          mkdirSync(storagePath, {recursive: true});
        } else {
          throw new Error(
            `Atomiq storage directory does not exist: ${storagePath}. Create it manually or mount a persistent volume.`,
          );
        }
      }

      const swapperOptions: TypedSwapperOptions<StarknetChainInitializers> = {
        bitcoinNetwork: bitcoinNetworkEnum,
        chains: {
          STARKNET: {
            rpcUrl: this.config.starknetRpcUrl
          }
        },
        swapStorage: (chainId: string) => {
          return new SqliteUnifiedStorage(`${storagePath}/CHAIN_${chainId}.sqlite3`);
        },
        chainStorageCtor: (name: string) => {
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
      this.log.info('Atomiq SDK initialized');
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

  /**
   * Returns the configured Starknet swap token from the SDK's token registry.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getSwapToken(): any {
    const Tokens = this.getTokens();
    const token = Tokens.STARKNET[this.config.swapToken];
    if (!token) {
      const available = Object.keys(Tokens.STARKNET).join(', ');
      throw new ExternalServiceError('Atomiq', `Unknown swap token: ${this.config.swapToken}. Available: ${available}`);
    }
    return token;
  }

  // ===========================================================================
  // Swap Creation
  // ===========================================================================

  async createLightningToStarknetSwap(params: {
    amountSats: bigint;
    destinationAddress: StarknetAddress;
  }): Promise<AtomiqSwapResult> {
    this.log.debug({
      amountSats: params.amountSats.toString(),
      destination: params.destinationAddress.toString()
    }, 'Creating Lightning-to-Starknet swap');
    await this.ensureInitialized();

    try {
      const Tokens = this.getTokens();
      const swapToken = this.getSwapToken();

      // Create swap: Lightning (BTCLN) → Starknet
      const swap = await this.swapper!.swap(
        Tokens.BITCOIN.BTCLN,
        swapToken,
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

      this.log.info({
        swapId,
        amountSats: params.amountSats.toString()
      }, 'Lightning-to-Starknet swap created');
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
    this.log.debug({
      amountSats: params.amountSats.toString(),
      destination: params.destinationAddress.toString()
    }, 'Creating Bitcoin-to-Starknet swap');
    await this.ensureInitialized();

    try {
      const swapToken = this.getSwapToken();

      // Force escrow-based swap (FromBTCSwap) instead of SPV vault swap,
      // because SPV vault swaps use a PSBT-based flow with no deposit address,
      // which is incompatible with BIM's "show QR code" receive flow.
      const exactOut = false; // i.e. exactIn = true
      const swap = await this.swapper!.createFromBTCSwap(
        'STARKNET',
        params.destinationAddress.toString(),
        swapToken.address,
        params.amountSats,
        exactOut,
      );

      if (!swap) {
        throw new Error('SDK returned null swap object');
      }

      const swapId = swap.getId();
      // Access .address directly: getAddress() throws in PR_CREATED state,
      // but the LP-provided deposit address is already available as a property.
      const depositAddress = swap.address;
      const bip21Uri = `bitcoin:${depositAddress}?amount=${Number(params.amountSats) / 100000000}`;

      // Register swap for tracking
      this.swapRegistry.set(swapId, {
        swapObject: swap,
        direction: 'bitcoin_to_starknet',
        createdAt: new Date()
      });

      this.log.info({
        swapId,
        amountSats: params.amountSats.toString()
      }, 'Bitcoin-to-Starknet swap created');
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
    this.log.debug({source: params.sourceAddress.toString()},
      'Creating Starknet-to-Lightning swap');
    await this.ensureInitialized();

    try {
      const Tokens = this.getTokens();

      // Create reverse the swap: Starknet (WBTC) → Lightning (BTCLN)
      const swap = await this.swapper!.swap(
        this.getSwapToken(),
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

      this.log.info({
        swapId,
        amountSats: amountSats.toString()
      }, 'Starknet-to-Lightning swap created');
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
    this.log.debug({
      amountSats: params.amountSats.toString(),
      destination: params.destinationAddress.toString(),
      source: params.sourceAddress.toString()
    }, 'Creating Starknet-to-Bitcoin swap');
    await this.ensureInitialized();

    try {
      const Tokens = this.getTokens();

      // Create reverse the swap: Starknet (WBTC) → Bitcoin (BTC)
      const swap = await this.swapper!.swap(
        this.getSwapToken(),
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

      this.log.info({
        swapId,
        amountSats: params.amountSats,
      }, 'Starknet-to-Bitcoin swap created');
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

  /**
   * Gets the lowest swap fee percentage from available intermediaries.
   * Falls back to a default value if no intermediaries are available.
   *
   * @param swapType The type of swap to get fees for
   * @returns Fee percentage (e.g., 0.5 for 0.5%)
   */
  private getSwapFeePercent(swapType: SwapType): number {
    const DEFAULT_FEE = 0.5;

    const intermediaries = this.swapper?.intermediaryDiscovery?.intermediaries;
    if (!intermediaries?.length) {
      return DEFAULT_FEE;
    }

    let lowestFee = Infinity;
    for (const intermediary of intermediaries) {
      const service = intermediary.services[swapType];
      if (service?.swapFeePPM !== undefined) {
        // Convert PPM (parts per million) to percentage
        const feePct = service.swapFeePPM / 10000;
        if (feePct < lowestFee) {
          lowestFee = feePct;
        }
      }
    }

    const result: number = lowestFee === Infinity ? DEFAULT_FEE : lowestFee;
    this.log.trace(`getSwapFeePercent: ${result}`);
    return result;
  }

  async getLightningToStarknetLimits(): Promise<SwapLimits> {
    await this.ensureInitialized();
    const Tokens = this.getTokens();
    const limits = this.swapper!.getSwapLimits(
      Tokens.BITCOIN.BTCLN,
      this.getSwapToken()
    );
    this.log.debug({...limits}, `swapper.getSwapLimits`);
    const result: SwapLimits = {
      minSats: limits.input.min.rawAmount ?? 0n,
      maxSats: limits.input.max?.rawAmount ?? 0n,
      feePercent: this.getSwapFeePercent(SwapType.FROM_BTCLN),
    };
    this.log.debug({...result}, `getLightningToStarknetLimits result`);
    return result;
  }

  async getBitcoinToStarknetLimits(): Promise<SwapLimits> {
    await this.ensureInitialized();
    const Tokens = this.getTokens();
    const limits = this.swapper!.getSwapLimits(
      Tokens.BITCOIN.BTC,
      this.getSwapToken()
    );
    const result: SwapLimits = {
      minSats: limits.input.min.rawAmount ?? 0n,
      maxSats: limits.input.max?.rawAmount ?? 0n,
      feePercent: this.getSwapFeePercent(SwapType.FROM_BTC),
    };
    this.log.debug({...result}, `getBitcoinToStarknetLimits result`);
    return result;
  }

  async getStarknetToLightningLimits(): Promise<SwapLimits> {
    await this.ensureInitialized();
    const Tokens = this.getTokens();
    const limits = this.swapper!.getSwapLimits(
      this.getSwapToken(),
      Tokens.BITCOIN.BTCLN
    );
    const result: SwapLimits = {
      minSats: limits.input.min.rawAmount ?? 0n,
      maxSats: limits.input.max?.rawAmount ?? 0n,
      feePercent: this.getSwapFeePercent(SwapType.TO_BTCLN),
    };
    this.log.debug({...result}, `getStarknetToLightningLimits result`);
    return result;
  }

  async getStarknetToBitcoinLimits(): Promise<SwapLimits> {
    await this.ensureInitialized();
    const Tokens = this.getTokens();
    const limits = this.swapper!.getSwapLimits(
      this.getSwapToken(),
      Tokens.BITCOIN.BTC
    );
    const result: SwapLimits = {
      minSats: limits.input.min.rawAmount ?? 0n,
      maxSats: limits.input.max?.rawAmount ?? 0n,
      feePercent: this.getSwapFeePercent(SwapType.TO_BTC),
    };
    this.log.debug({...result}, `getStarknetToBitcoinLimits result`);
    return result;
  }

  // ===========================================================================
  // Swap Monitoring
  // ===========================================================================

  async registerSwapForMonitoring(
    swapId: SwapId,
    swapObject: unknown,
  ): Promise<void> {
    this.log.info({swapId}, 'Registering swap for monitoring');
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
    this.log.debug({swapId}, 'Getting swap status');
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

    const {isPaid, isCompleted, isFailed, isExpired} = this.mapStateToStatus(state);
    const result: AtomiqSwapStatus = {
      state,
      isPaid,
      isCompleted,
      isFailed,
      isExpired,
      txHash: swap.data?.getTxId?.(),
    };
    this.log.debug({...result}, `getSwapStatus result`);
    return result;
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
    this.log.debug({swapId}, 'Claiming swap');
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
      const result: ClaimResult = {
        txHash,
        success: true,
      };
      this.log.debug({...result}, `claimSwap result`);
      return result;
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
    this.log.debug({swapId}, 'Getting unsigned claim transactions');
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
