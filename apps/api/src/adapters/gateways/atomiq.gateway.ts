import {type StarknetChainType, StarknetInitializer, type StarknetInitializerType} from '@atomiqlabs/chain-starknet';
import {type FromBTCSwap, type TypedSwapper, type TypedSwapperOptions} from '@atomiqlabs/sdk';
import {BitcoinNetwork, SwapperFactory, SwapType} from '@atomiqlabs/sdk';
import {SqliteStorageManager, SqliteUnifiedStorage} from '@atomiqlabs/storage-sqlite';
import {StarknetAddress} from "@bim/domain/account";
import type {
  AtomiqGateway,
  AtomiqReverseSwapResult,
  AtomiqSwapResult,
  AtomiqSwapStatus,
  BitcoinSwapCommitResult,
  BitcoinSwapQuote,
  ClaimResult,
  StarknetCall,
  UnsignedClaimTransactions
} from '@bim/domain/ports';
import {ExternalServiceError} from "@bim/domain/shared";
import type {SwapDirection, SwapLimits} from "@bim/domain/swap";
import {BitcoinAddress, LightningInvoice, SwapId} from '@bim/domain/swap';
import {existsSync, mkdirSync} from 'node:fs';

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
  private isInitialized: boolean = false;
  private readonly log: Logger;

  constructor(
    private readonly config: AtomiqGatewayConfig,
    rootLogger: Logger,
  ) {
    this.log = rootLogger.child({name: 'atomiq.gateway.ts'});
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
        saveUninitializedSwaps: true,
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
    const direction: SwapDirection = 'lightning_to_starknet';
    this.log.debug({
      amountSats: params.amountSats.toString(),
      destination: params.destinationAddress.toString()
    }, `Creating ${direction} swap`);
    await this.ensureInitialized();

    try {
      const swapToken = this.getSwapToken();

      // Create swap: Lightning (BTCLN) → Starknet
      const swap = await this.swapper!.createFromBTCLNSwapNew(
        'STARKNET',
        params.destinationAddress.toString(),
        swapToken.address,
        params.amountSats,
        false, // exactOut = false (i.e. exactIn)
      );

      if (!swap) {
        throw new Error('SDK returned null swap object');
      }

      const swapId = swap.getId();
      const invoice = swap.getAddress();
      const quoteExpiry: any = swap.getQuoteExpiry();

      this.logSwapExpiry(swapId, quoteExpiry, direction);

      this.log.info({
        swapId,
        amountSats: params.amountSats.toString()
      }, `${direction} swap created`);
      return {
        swapId,
        invoice,
        expiresAt: new Date(quoteExpiry),
      };
    } catch (error) {
      throw new ExternalServiceError(
        'Atomiq',
        `Failed to create ${direction} swap: ${error instanceof Error
          ? error.message
          : String(error)}`,
      );
    }
  }


  async createStarknetToLightningSwap(params: {
    invoice: LightningInvoice;
    sourceAddress: StarknetAddress;
  }): Promise<AtomiqReverseSwapResult> {
    const direction: SwapDirection = 'starknet_to_lightning';
    this.log.debug({source: params.sourceAddress.toString()},
      `Creating ${direction} swap`);
    await this.ensureInitialized();

    try {
      // Create reverse swap: Starknet (WBTC) → Lightning (BTCLN)
      const swapToken = this.getSwapToken();
      const swap = await this.swapper!.createToBTCLNSwap(
        'STARKNET',
        params.sourceAddress.toString(),
        swapToken.address,
        params.invoice.toString(),
      );

      if (!swap) {
        throw new Error('SDK returned null swap object');
      }

      const swapId = swap.getId();
      const depositAddress = swap.getInputAddress() ?? '';
      const amountSats = swap.getInput().rawAmount ?? 0n;

      const quoteExpiry: any = swap.getQuoteExpiry();
      this.logSwapExpiry(swapId, quoteExpiry, direction);

      this.log.info({
        swapId,
        amountSats: amountSats.toString()
      }, `${direction} swap created`);
      return {
        swapId,
        depositAddress,
        amountSats,
        expiresAt: new Date(quoteExpiry),
      };
    } catch (error) {
      throw new ExternalServiceError(
        'Atomiq',
        `Failed to create ${direction} swap: ${error instanceof Error
          ? error.message
          : String(error)}`,
      );
    }
  }

  async createBitcoinToStarknetSwap(params: {
    amountSats: bigint;
    destinationAddress: StarknetAddress;
  }): Promise<AtomiqSwapResult> {
    const direction: SwapDirection = 'bitcoin_to_starknet';
    this.log.debug({
      amountSats: params.amountSats.toString(),
      destination: params.destinationAddress.toString()
    }, `Creating ${direction} swap`);
    await this.ensureInitialized();

    try {
      const swapToken = this.getSwapToken();

      // Force escrow-based swap (FromBTCSwap) instead of SPV vault swap,
      // because SPV vault swaps use a PSBT-based flow with no deposit address,
      // which is incompatible with BIM's "show QR code" receive flow.
      const exactOut = false; // i.e. exactIn = true
      const swap: FromBTCSwap<StarknetChainType> = await this.swapper!.createFromBTCSwap(
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
      const depositAddress = swap.getAddress();
      const bip21Uri = `bitcoin:${depositAddress}?amount=${Number(params.amountSats) / 100000000}`;


      const quoteExpiry: any = swap.getQuoteExpiry();
      this.logSwapExpiry(swapId, quoteExpiry, direction);

      this.log.info({
        swapId,
        amountSats: params.amountSats.toString()
      }, `${direction} swap created`);
      return {
        swapId,
        depositAddress,
        bip21Uri,
        expiresAt: new Date(quoteExpiry),
      };
    } catch (error) {
      throw new ExternalServiceError(
        'Atomiq',
        `Failed to create ${direction} swap: ${error instanceof Error
          ? error.message
          : String(error)}`,
      );
    }
  }

  async prepareBitcoinToStarknetSwap(params: {
    amountSats: bigint;
    destinationAddress: StarknetAddress;
  }): Promise<BitcoinSwapQuote> {
    const direction: SwapDirection = 'bitcoin_to_starknet';
    this.log.debug({
      amountSats: params.amountSats.toString(),
      destination: params.destinationAddress.toString()
    }, `Preparing ${direction} swap (phase 1: quote + commit txs)`);
    await this.ensureInitialized();

    try {
      const swapToken = this.getSwapToken();

      const exactOut = false;
      const swap: FromBTCSwap<StarknetChainType> = await this.swapper!.createFromBTCSwap(
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

      // Get unsigned commit transactions (Starknet escrow creation)
      const commitTxs = await swap.txsCommit();

      // Extract Call[] from StarknetTx[] and convert to StarknetCall[]
      const commitCalls: StarknetCall[] = [];
      for (const tx of commitTxs) {
        if (tx && typeof tx === 'object' && 'type' in tx && tx.type === 'INVOKE' && 'tx' in tx) {
          const calls = tx.tx as Array<{contractAddress: string; entrypoint: string; calldata?: string[]}>;
          for (const call of calls) {
            commitCalls.push({
              contractAddress: call.contractAddress,
              entrypoint: call.entrypoint,
              calldata: call.calldata ?? [],
            });
          }
        }
      }

      if (commitCalls.length === 0) {
        throw new Error('No commit calls extracted from SDK transactions');
      }

      const quoteExpiry: any = swap.getQuoteExpiry();
      this.logSwapExpiry(swapId, quoteExpiry, direction);

      this.log.info({
        swapId,
        commitCallsCount: commitCalls.length,
        amountSats: params.amountSats.toString()
      }, `${direction} swap prepared (pending commit)`);

      return {
        swapId,
        commitCalls,
        expiresAt: new Date(quoteExpiry),
      };
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error;
      throw new ExternalServiceError(
        'Atomiq',
        `Failed to prepare ${direction} swap: ${error instanceof Error
          ? error.message
          : String(error)}`,
      );
    }
  }

  async completeBitcoinSwapCommit(swapId: string): Promise<BitcoinSwapCommitResult> {
    this.log.debug({swapId}, 'Completing Bitcoin swap commit (phase 2: wait + get address)');
    await this.ensureInitialized();

    try {
      const swap = await this.getSwapObject(swapId);

      // Wait for the SDK to detect the on-chain commit
      // This polls the chain state until the swap transitions to CLAIM_COMMITED
      const abortController = new AbortController();
      const timeout = setTimeout(() => abortController.abort(), 90_000); // 90s timeout

      try {
        await swap.waitTillCommited(abortController.signal);
      } finally {
        clearTimeout(timeout);
      }

      // Now the swap is committed — get the Bitcoin deposit address
      const depositAddress = swap.getAddress();
      const amount = swap.getInput()?.rawAmount ?? 0n;
      const bip21Uri = `bitcoin:${depositAddress}?amount=${Number(amount) / 100000000}`;

      this.log.info({swapId, depositAddress}, 'Bitcoin swap commit completed');

      return {depositAddress, bip21Uri};
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error;
      throw new ExternalServiceError(
        'Atomiq',
        `Failed to complete Bitcoin swap commit: ${error instanceof Error
          ? error.message
          : String(error)}`,
      );
    }
  }

  async createStarknetToBitcoinSwap(params: {
    amountSats: bigint;
    destinationAddress: BitcoinAddress;
    sourceAddress: StarknetAddress;
  }): Promise<AtomiqReverseSwapResult> {
    const direction: SwapDirection = 'starknet_to_bitcoin';
    this.log.debug({
      amountSats: params.amountSats.toString(),
      destination: params.destinationAddress.toString(),
      source: params.sourceAddress.toString()
    }, `Creating ${direction} swap`);
    await this.ensureInitialized();

    try {
      // Create reverse swap: Starknet (WBTC) → Bitcoin (BTC)
      const swapToken = this.getSwapToken();
      const swap = await this.swapper!.createToBTCSwap(
        'STARKNET',
        params.sourceAddress.toString(),
        swapToken.address,
        params.destinationAddress.toString(),
        params.amountSats,
        true, // exactIn
      );

      if (!swap) {
        throw new Error('SDK returned null swap object');
      }

      const swapId = swap.getId();
      const depositAddress = swap.getInputAddress() ?? '';

      const quoteExpiry = swap.getQuoteExpiry();
      this.logSwapExpiry(swapId, quoteExpiry, direction);

      this.log.info({
        swapId,
        amountSats: params.amountSats,
      }, `${direction} swap created`);
      return {
        swapId,
        depositAddress,
        amountSats: params.amountSats,
        expiresAt: new Date(quoteExpiry),
      };
    } catch (error) {
      throw new ExternalServiceError(
        'Atomiq',
        `Failed to create ${direction} swap: ${error instanceof Error
          ? error.message
          : String(error)}`,
      );
    }
  }

  /**
   * Log the real invoice expiry from the SDK (LP-determined)
   */
  private logSwapExpiry(
    swapId: string,
    expiryMs: number | undefined,
    direction: SwapDirection
  ): void {
    try {
      if (expiryMs) {
        const sdkExpiryDate = new Date(expiryMs);
        const now = new Date();
        const remainingSeconds = Math.round((expiryMs - Date.now()) / 1000);
        this.log.info({
          swapId,
          expiryTime: sdkExpiryDate.toISOString(),
          now: now.toISOString(),
          remainingSec: remainingSeconds,
        }, `${direction} swap real expiry from LP invoice`);
      }
    } catch (e) {
      this.log.warn({
        swapId,
        error: String(e)
      }, 'Could not read SDK expiry time');
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
      maxSats: limits.input.max?.rawAmount ?? BigInt(Number.MAX_SAFE_INTEGER),
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
      maxSats: limits.input.max?.rawAmount ?? BigInt(Number.MAX_SAFE_INTEGER),
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
      maxSats: limits.input.max?.rawAmount ?? BigInt(Number.MAX_SAFE_INTEGER),
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
      maxSats: limits.input.max?.rawAmount ?? BigInt(Number.MAX_SAFE_INTEGER),
      feePercent: this.getSwapFeePercent(SwapType.TO_BTC),
    };
    this.log.debug({...result}, `getStarknetToBitcoinLimits result`);
    return result;
  }

  // ===========================================================================
  // Swap Monitoring
  // ===========================================================================

  /**
   * Retrieves a swap object from the SDK's persistent storage.
   * Returns any because subclass methods (txsClaim, claim, etc.) are
   * not on the ISwap base type — we use duck-typing to call them.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async getSwapObject(swapId: string): Promise<any> {
    await this.ensureInitialized();
    return this.swapper!.getSwapById(swapId, 'STARKNET');
  }

  async getSwapStatus(swapId: SwapId): Promise<AtomiqSwapStatus> {
    this.log.debug({swapId}, 'Getting swap status');

    try {
      const swap = await this.getSwapObject(swapId);
      const state = swap.getState();

      const {isPaid, isCompleted, isFailed, isExpired} = this.mapStateToStatus(state);
      const result: AtomiqSwapStatus = {
        state,
        isPaid,
        isCompleted,
        isFailed,
        isExpired,
        txHash: swap.getOutputTxId() ?? swap.getInputTxId() ?? undefined,
      };
      this.log.debug({...result}, 'getSwapStatus result');
      return result;
    } catch {
      return {
        state: -1,
        isPaid: false,
        isCompleted: false,
        isFailed: false,
        isExpired: true,
        error: `Swap ${swapId} not found in SDK storage`,
      };
    }
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

  /**
   * Waits for the intermediary/watchtower cooperative claim to complete.
   *
   * BIM has no Starknet signer (WebAuthn accounts), so we cannot call
   * txsClaim()/claim() ourselves. Instead we rely on the LP or watchtower
   * network to claim on-chain, and just wait for completion.
   */
  async claimSwap(swapId: SwapId): Promise<ClaimResult> {
    this.log.debug({swapId}, 'Waiting for cooperative claim');
    const swap = await this.getSwapObject(swapId);

    try {
      if (typeof swap.waitTillClaimed === 'function') {
        await swap.waitTillClaimed();
      }

      const txHash = swap.getOutputTxId() ?? swap.getInputTxId() ?? `0x${crypto.randomUUID().replaceAll('-', '')}`;
      const result: ClaimResult = {
        txHash,
        success: true,
      };
      this.log.debug({...result}, 'claimSwap result (cooperative claim completed)');
      return result;
    } catch (error) {
      throw new ExternalServiceError(
        'Atomiq',
        `Failed to wait for cooperative claim: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async waitForClaimConfirmation(swapId: SwapId): Promise<void> {
    const swap = await this.getSwapObject(swapId);

    if (typeof swap.waitTillClaimed === 'function') {
      await swap.waitTillClaimed();
    }
  }

  async getUnsignedClaimTransactions(
    swapId: SwapId,
  ): Promise<UnsignedClaimTransactions> {
    this.log.debug({swapId}, 'Getting unsigned claim transactions');
    const swap = await this.getSwapObject(swapId);
    const state = swap.getState();
    const swapType = swap.getType();

    try {
      let transactions: unknown[] = [];
      let message = '';

      // Determine which transactions to get based on swap type and state
      if (swapType === SwapType.TO_BTCLN || swapType === SwapType.TO_BTC) {
        // Reverse swaps (Starknet → BTC/Lightning)
        if (state === 0 && typeof swap.txsCommit === 'function') {
          transactions = await swap.txsCommit();
          message = 'Commit transactions ready';
        } else if (state === 1 && typeof swap.txsRefund === 'function') {
          transactions = await swap.txsRefund();
          message = 'Refund transactions ready';
        }
      } else {
        // Forward swaps (BTC/Lightning → Starknet)
        if (state === 2 && typeof swap.txsClaim === 'function') {
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
    this.swapper = null;
    this.swapperFactory = null;
    this.isInitialized = false;
  }
}
