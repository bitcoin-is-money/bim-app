import {type StarknetChainType, StarknetInitializer, type StarknetInitializerType} from '@atomiqlabs/chain-starknet';
import type {FromBTCSwap, TypedSwapper, TypedSwapperOptions} from '@atomiqlabs/sdk';
import {BitcoinNetwork, SwapperFactory, SwapType} from '@atomiqlabs/sdk';
import {OutOfBoundsError} from '@atomiqlabs/sdk/dist/errors/RequestError';
import {PgStorageManager, PgUnifiedStorage} from '@bim/atomiq-storage-postgres';
import type pg from 'pg';
import type {StarknetAddress} from "@bim/domain/account";
import type {
  AtomiqGateway,
  AtomiqReverseSwapResult,
  AtomiqSwapResult,
  AtomiqSwapStatus,
  BitcoinSwapCommitResult,
  BitcoinSwapQuote,
  ForwardSwapClaimResult,
  StarknetCall,
} from '@bim/domain/ports';
import {ExternalServiceError, type BitcoinNetwork as DomainBitcoinNetwork, type SanitizedError, validateExternalCalls} from "@bim/domain/shared";
import type {HealthRegistry} from "@bim/domain/health";
import type {SwapDirection, SwapLimits, BitcoinAddress, LightningInvoice, SwapId,
  ClaimerConfig
} from "@bim/domain/swap";
import {LightningInvoiceExpiredError, SwapAmountError} from "@bim/domain/swap";
import {Amount} from "@bim/domain/shared";
import type {Logger} from "pino";
import {Account as StarknetAccount, RpcProvider, Signer as StarknetSigner} from 'starknet';
import {isInfraFailure, sanitizeAtomiqError} from './atomiq-error';

/* eslint-disable
   @typescript-eslint/no-unsafe-assignment,
   @typescript-eslint/no-unsafe-member-access,
   @typescript-eslint/no-unsafe-call,
   @typescript-eslint/no-unsafe-argument,
   @typescript-eslint/no-explicit-any,
   @typescript-eslint/no-non-null-assertion
   ---
   @atomiqlabs/sdk exposes untyped (any) APIs at runtime.
   These rules are disabled file-wide because virtually every SDK interaction triggers them.
*/

/**
 * Configuration for Atomiq gateway.
 */
export interface AtomiqGatewayConfig {
  /** Starknet network to connect to */
  network: DomainBitcoinNetwork;
  /** Starknet JSON-RPC endpoint URL */
  starknetRpcUrl: string;
  /** Custom Atomiq intermediary URL; uses the default public intermediary if omitted */
  intermediaryUrl?: string;
  /** PostgreSQL connection pool for swap storage */
  pool: pg.Pool;
  /** Token symbol used for swaps (e.g. 'WBTC') */
  swapToken: string;
  /** Token contract addresses known to the system, used to validate external calls */
  knownTokenAddresses: readonly StarknetAddress[];
  /** Backend account for auto-claiming forward swaps */
  claimer: ClaimerConfig;
  /** STRK token address for bounty refund transfers */
  strkTokenAddress: string;
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
  private isInitialized = false;
  private readonly log: Logger;
  private readonly claimerAccount: StarknetAccount;

  constructor(
    private readonly config: AtomiqGatewayConfig,
    rootLogger: Logger,
    private readonly healthRegistry: HealthRegistry,
  ) {
    this.log = rootLogger.child({name: 'atomiq.gateway.ts'});
    this.claimerAccount = new StarknetAccount({
      provider: new RpcProvider({nodeUrl: this.config.starknetRpcUrl}),
      address: this.config.claimer.address,
      signer: new StarknetSigner(this.config.claimer.privateKey),
    });
  }

  private handleAtomiqFailure(err: unknown, context: string): SanitizedError {
    const sanitized = sanitizeAtomiqError(err);
    // Only confirmed infrastructure-level failure kinds (the ones we have
    // actually observed in prod) flip the health flag. An `unknown` error is
    // more likely a functional/SDK bug than an Atomiq outage, so we keep the
    // component's current health state to avoid false `BIM: atomiq is down`
    // alerts on Slack.
    if (isInfraFailure(sanitized)) {
      this.healthRegistry.reportDown('atomiq', sanitized);
    }
    this.log.error({atomiqError: sanitized, context}, 'Atomiq call failed');
    return sanitized;
  }

  private markAtomiqHealthy(): void {
    this.healthRegistry.reportHealthy('atomiq');
  }

  // ===========================================================================
  // Health check
  // ===========================================================================

  /**
   * Pings the Atomiq intermediary with a lightweight HTTP GET.
   * Any HTTP response (even 404) means the server is reachable.
   * A network error, timeout, or Cloudflare 530 means it is down.
   */
  async checkHealth(): Promise<void> {
    const url = this.config.intermediaryUrl;
    if (url === undefined) {
      this.markAtomiqHealthy();
      return;
    }
    try {
      const response = await fetch(url, {signal: AbortSignal.timeout(5_000)});
      // Cloudflare Tunnel error pages return 530 with an HTML body
      if (response.status === 530) {
        const body = await response.text();
        this.handleAtomiqFailure(
          Object.assign(new Error(body), {httpCode: 530}),
          'checkHealth',
        );
        return;
      }
      this.markAtomiqHealthy();
    } catch (err: unknown) {
      this.handleAtomiqFailure(err, 'checkHealth');
    }
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

      const swapperOptions: TypedSwapperOptions<StarknetChainInitializers> = {
        bitcoinNetwork: bitcoinNetworkEnum,
        saveUninitializedSwaps: true,
        chains: {
          STARKNET: {
            rpcUrl: this.config.starknetRpcUrl
          }
        },
        swapStorage: (_chainId: string) => {
          return new PgUnifiedStorage(this.config.pool, 'atomiq_swaps');
        },
        chainStorageCtor: (_name: string) => {
          return new PgStorageManager(this.config.pool, 'atomiq_store');
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
      this.markAtomiqHealthy();
    } catch (error) {
      const sanitized = this.handleAtomiqFailure(error, 'initialize');
      throw new ExternalServiceError('Atomiq', `Failed to initialize SDK: ${sanitized.summary}`);
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
    description?: string;
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
        true, // exactOut = true: user receives exactly the requested amount, payer covers fees
        undefined, // additionalParams
        params.description ? {description: params.description} : undefined,
      );

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive: SDK may return null at runtime
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
      this.markAtomiqHealthy();
      return {
        swapId,
        invoice,
        expiresAt: new Date(quoteExpiry),
      };
    } catch (error) {
      if (error instanceof OutOfBoundsError) {
        this.markAtomiqHealthy();
        throw new SwapAmountError(Amount.ofSatoshi(params.amountSats), Amount.ofSatoshi(error.min), Amount.ofSatoshi(error.max));
      }
      const sanitized = this.handleAtomiqFailure(error, `createLightningToStarknetSwap`);
      throw new ExternalServiceError('Atomiq', `Failed to create ${direction} swap: ${sanitized.summary}`);
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
      // Create the reverse swap: Starknet (WBTC) → Lightning (BTCLN)
      const swapToken = this.getSwapToken();
      const swap = await this.swapper!.createToBTCLNSwap(
        'STARKNET',
        params.sourceAddress.toString(),
        swapToken.address,
        params.invoice.toString(),
      );

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive: SDK may return null at runtime
      if (!swap) {
        throw new Error('SDK returned null swap object');
      }

      const swapId = swap.getId();
      const amountSats = swap.getInput().rawAmount ?? 0n; // eslint-disable-line @typescript-eslint/no-unnecessary-condition -- defensive

      // Get commit transactions (escrow creation on Starknet)
      const commitCalls = await this.extractCommitCalls(swap);

      const quoteExpiry: any = swap.getQuoteExpiry();
      this.logSwapExpiry(swapId, quoteExpiry, direction);

      this.log.info({
        swapId,
        amountSats: amountSats.toString(),
        commitCallsCount: commitCalls.length,
      }, `${direction} swap created`);
      this.markAtomiqHealthy();
      return {
        swapId,
        commitCalls,
        amountSats,
        expiresAt: new Date(quoteExpiry),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('pr - expired') || message.includes('pr -expired')) {
        this.markAtomiqHealthy();
        throw new LightningInvoiceExpiredError();
      }
      if (error instanceof OutOfBoundsError) {
        this.markAtomiqHealthy();
        throw new SwapAmountError(Amount.ofSatoshi(0n), Amount.ofSatoshi(error.min), Amount.ofSatoshi(error.max));
      }
      const sanitized = this.handleAtomiqFailure(error, 'createStarknetToLightningSwap');
      throw new ExternalServiceError('Atomiq', `Failed to create ${direction} swap: ${sanitized.summary}`);
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

      const exactOut = true; // User receives exactly the requested amount, payer covers fees
      const swap: FromBTCSwap<StarknetChainType> = await this.swapper!.createFromBTCSwap(
        'STARKNET',
        params.destinationAddress.toString(),
        swapToken.address,
        params.amountSats,
        exactOut,
      );

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive: SDK may return null at runtime
      if (!swap) {
        throw new Error('SDK returned null swap object');
      }

      const swapId = swap.getId();

      // Get commit transactions (escrow creation on Starknet)
      const commitCalls = await this.extractCommitCalls(swap);

      const quoteExpiry: any = swap.getQuoteExpiry();
      this.logSwapExpiry(swapId, quoteExpiry, direction);

      this.log.info({
        swapId,
        commitCallsCount: commitCalls.length,
        amountSats: params.amountSats.toString()
      }, `${direction} swap prepared (pending commit)`);
      this.markAtomiqHealthy();

      return {
        swapId,
        commitCalls,
        expiresAt: new Date(quoteExpiry),
      };
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error;
      if (error instanceof OutOfBoundsError) {
        this.markAtomiqHealthy();
        throw new SwapAmountError(Amount.ofSatoshi(0n), Amount.ofSatoshi(error.min), Amount.ofSatoshi(error.max));
      }
      const sanitized = this.handleAtomiqFailure(error, 'prepareBitcoinToStarknetSwap');
      throw new ExternalServiceError('Atomiq', `Failed to prepare ${direction} swap: ${sanitized.summary}`);
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
      const timeout = setTimeout(() => { abortController.abort(); }, 90_000); // 90s timeout

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
      this.markAtomiqHealthy();

      return {depositAddress, bip21Uri};
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error;
      const sanitized = this.handleAtomiqFailure(error, 'completeBitcoinSwapCommit');
      throw new ExternalServiceError('Atomiq', `Failed to complete Bitcoin swap commit: ${sanitized.summary}`);
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
      // Create the reverse swap: Starknet (WBTC) → Bitcoin (BTC)
      const swapToken = this.getSwapToken();
      const swap = await this.swapper!.createToBTCSwap(
        'STARKNET',
        params.sourceAddress.toString(),
        swapToken.address,
        params.destinationAddress.toString(),
        params.amountSats,
        true, // exactIn
      );

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive: SDK may return null at runtime
      if (!swap) {
        throw new Error('SDK returned null swap object');
      }

      const swapId = swap.getId();

      // Get commit transactions (escrow creation on Starknet)
      const commitCalls = await this.extractCommitCalls(swap);

      const quoteExpiry = swap.getQuoteExpiry();
      this.logSwapExpiry(swapId, quoteExpiry, direction);

      this.log.info({
        swapId,
        amountSats: params.amountSats,
        commitCallsCount: commitCalls.length,
      }, `${direction} swap created`);
      this.markAtomiqHealthy();
      return {
        swapId,
        commitCalls,
        amountSats: params.amountSats,
        expiresAt: new Date(quoteExpiry),
      };
    } catch (error) {
      if (error instanceof OutOfBoundsError) {
        this.markAtomiqHealthy();
        throw new SwapAmountError(Amount.ofSatoshi(params.amountSats), Amount.ofSatoshi(error.min), Amount.ofSatoshi(error.max));
      }
      const sanitized = this.handleAtomiqFailure(error, 'createStarknetToBitcoinSwap');
      throw new ExternalServiceError('Atomiq', `Failed to create ${direction} swap: ${sanitized.summary}`);
    }
  }

  /**
   * Extracts StarknetCall[] from SDK commit transactions.
   * Shared between forward and reverse swap creation.
   */
  private async extractCommitCalls(swap: any): Promise<StarknetCall[]> {
    const commitTxs = await swap.txsCommit();
    const commitCalls: StarknetCall[] = [];
    for (const tx of commitTxs) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive: SDK tx structure may vary
      if (tx && typeof tx === 'object' && 'type' in tx && tx.type === 'INVOKE' && 'tx' in tx) {
        const calls = tx.tx as {contractAddress: string; entrypoint: string; calldata?: string[]}[];
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
    validateExternalCalls(commitCalls, this.config.knownTokenAddresses, 'Atomiq');
    return commitCalls;
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

    const intermediaries = this.swapper?.intermediaryDiscovery.intermediaries;
    if (!intermediaries?.length) {
      return DEFAULT_FEE;
    }

    let lowestFee = Infinity;
    for (const intermediary of intermediaries) {
      // eslint-disable-next-line security/detect-object-injection -- swapType is a SwapType enum, not user input
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
  private async getSwapObject(swapId: string): Promise<any> {
    await this.ensureInitialized();
    return this.swapper!.getSwapById(swapId, 'STARKNET');
  }

  async getSwapStatus(swapId: SwapId, direction?: SwapDirection): Promise<AtomiqSwapStatus> {
    this.log.debug({swapId, direction}, 'Getting swap status');

    try {
      const swap = await this.getSwapObject(swapId);

      if (!swap) {
        // The Swap is not found in SDK storage (e.g., after container restart).
        // Return expired+error so syncWithAtomiq can mark it as 'lost'.
        return {
          state: -2,
          isPaid: false,
          isClaimable: false,
          isCompleted: false,
          isFailed: false,
          isExpired: true,
          isRefunded: false,
          isRefundable: false,
          error: `Swap ${swapId} not found in SDK storage`,
        };
      }

      // Force the SDK to check on-chain state before reading.
      // This can recover a swap from QUOTE_SOFT_EXPIRED (-1) to COMMITED (1)
      // when the commit transaction was submitted externally (via AVNU paymaster).
      if (typeof swap._sync === 'function') {
        try {
          await swap._sync(true);
        } catch (syncErr) {
          this.log.warn({swapId, error: String(syncErr)}, 'SDK _sync() failed, reading state as-is');
        }
      }

      const state = swap.getState();

      const {isPaid, isClaimable, isCompleted, isFailed, isExpired, isRefunded, isRefundable} = this.mapStateToStatus(state, direction);
      const result: AtomiqSwapStatus = {
        state,
        isPaid,
        isClaimable,
        isCompleted,
        isFailed,
        isExpired,
        isRefunded,
        isRefundable,
        txHash: swap.getOutputTxId() ?? swap.getInputTxId() ?? undefined,
      };
      this.log.debug({...result}, 'getSwapStatus result');
      this.markAtomiqHealthy();
      return result;
    } catch (err) {
      // Do NOT swallow errors into a fake "expired" response — transient failures
      // (network timeout, 500, etc.) would permanently kill active swaps with
      // funds in escrow. Let the error propagate; syncWithAtomiq has its own
      // try/catch that logs a warning and preserves the swap's current state.
      const sanitized = this.handleAtomiqFailure(err, 'getSwapStatus');
      this.log.warn({swapId, atomiqError: sanitized}, 'getSwapStatus failed');
      throw err;
    }
  }

  /**
   * Maps SDK state to status flags.
   *
   * Atomiq SDK states (direction-dependent):
   *
   * FromBTCLN (Lightning → Starknet):
   *   0: PR_CREATED, 1: PR_PAID, 2: CLAIM_COMMITED, 3: CLAIM_CLAIMED
   *
   * FromBTC (Bitcoin → Starknet):
   *   0: PR_CREATED, 1: CLAIM_COMMITED, 2: BTC_TX_CONFIRMED, 3: CLAIM_CLAIMED
   *
   * ToBTCLN (Starknet → Lightning):
   *   0: CREATED, 1: COMMITED, 2: SOFT_CLAIMED, 3: CLAIMED
   *
   * ToBTC (Starknet → Bitcoin):
   *   0: CREATED, 1: COMMITED, 2: SOFT_CLAIMED, 3: CLAIMED, 4: REFUNDABLE
   *
   * isPaid = payment detected (user has paid, but claim may not be possible yet)
   * isClaimable = swap is ready for on-chain claim (only relevant for forward swaps)
   */
  private mapStateToStatus(state: number, direction?: SwapDirection): {
    isPaid: boolean;
    isClaimable: boolean;
    isCompleted: boolean;
    isFailed: boolean;
    isExpired: boolean;
    isRefunded: boolean;
    isRefundable: boolean;
  } {
    const neutral = {isPaid: false, isClaimable: false, isCompleted: false, isFailed: false, isExpired: false, isRefunded: false, isRefundable: false};

    if (state < 0) {
      // QUOTE_SOFT_EXPIRED (-1): The LP authorization expired, but an on-chain
      // commit may still be pending confirmation. For reverse swaps (Starknet →
      // Lightning/Bitcoin), BIM submits the commit externally via AVNU paymaster,
      // so the SDK doesn't know about it until _sync() detects it on-chain.
      // Treat -1 as "still pending" for reverse swaps to avoid premature expiration.
      const isReverseSwap = direction === 'starknet_to_lightning' || direction === 'starknet_to_bitcoin';
      if (state === -1 && isReverseSwap) {
        return neutral;
      }

      // State -3 for reverse swaps (ToBTC/ToBTCLN) = REFUNDED (LP refunded escrow on source chain)
      if (state === -3 && isReverseSwap) {
        return {...neutral, isRefunded: true};
      }

      return {
        ...neutral,
        isFailed: state <= -3,
        isExpired: state > -3,
      };
    }

    const isForward = direction === 'lightning_to_starknet' || direction === 'bitcoin_to_starknet';
    const isReverseSwap = direction === 'starknet_to_lightning' || direction === 'starknet_to_bitcoin';

    // State 4 (REFUNDABLE) only exists for ToBTC/ToBTCLN: the LP failed to process
    // the swap and the escrow is refundable by the user on the source chain.
    if (state === 4 && isReverseSwap) {
      return {...neutral, isRefundable: true};
    }

    // For Bitcoin-to-Starknet swaps, the commit (state 1) happens before the
    // Bitcoin deposit (state 2). Only treat as "paid" once BTC is actually received.
    const paidThreshold = direction === 'bitcoin_to_starknet' ? 2 : 1;

    // Claimable: the swap is ready for on-chain claim by the backend.
    // Forward swaps: Lightning needs state >= 2 (CLAIM_COMMITED), Bitcoin needs state >= 2 (BTC_TX_CONFIRMED).
    // Reverse swaps: never claimable (LP handles claiming).
    const claimableThreshold = 2;

    return {
      isPaid: state >= paidThreshold,
      isClaimable: isForward && state >= claimableThreshold,
      isCompleted: state === 3,
      isFailed: false,
      isExpired: false,
      isRefunded: false,
      isRefundable: false,
    };
  }

  async isSwapPaid(swapId: SwapId): Promise<boolean> {
    const status = await this.getSwapStatus(swapId);
    return status.isPaid;
  }

  // ===========================================================================
  // Forward Swap Claiming
  // ===========================================================================

  async claimForwardSwap(swapId: SwapId): Promise<ForwardSwapClaimResult> {
    this.log.info({swapId}, 'Claiming forward swap with backend account');
    await this.ensureInitialized();

    const swap = await this.getSwapObject(swapId);
    const bountyAmount: bigint = swap._data.getClaimerBounty();
    const userAddress: string = swap._data.getClaimer();

    // 1. Claim — sends WBTC to user, bounty to whoever submitted the claim tx
    let claimTxHash: string;
    try {
      claimTxHash = await swap.claim(this.claimerAccount);
      this.log.info({swapId, claimTxHash}, 'Forward swap claim returned successfully');
      this.markAtomiqHealthy();
    } catch (error) {
      // If the swap was already claimed (by watchtower), the SDK detects it
      const state: number = swap.getState();
      if (state >= 3) {
        claimTxHash = swap.getOutputTxId() ?? 'unknown';
        this.log.info({swapId, claimTxHash, state}, 'Swap already claimed (watchtower won the race)');
        this.markAtomiqHealthy();
        return {claimTxHash, claimedByBackend: false, refundTxHash: undefined, bountyAmount: 0n, userAddress};
      }
      const sanitized = this.handleAtomiqFailure(error, 'claimForwardSwap');
      throw new ExternalServiceError('Atomiq', `Failed to claim forward swap ${swapId}: ${sanitized.summary}`);
    }

    // 2. The SDK returns a tx hash on success, but it may be the watchtower's tx
    //    (the SDK silently falls back to the watchtower's tx in its catch block).
    //    Verify the on-chain sender to know if WE actually claimed.
    const claimedByBackend = await this.isClaimTxFromBackend(claimTxHash);
    if (!claimedByBackend) {
      this.log.warn(
        {swapId, claimTxHash, bountyAmount: bountyAmount.toString()},
        'Claim tx was submitted by watchtower, not by backend — bounty not received, skipping refund',
      );
      return {claimTxHash, claimedByBackend: false, refundTxHash: undefined, bountyAmount: 0n, userAddress};
    }

    this.log.info({swapId, claimTxHash}, 'Claim tx confirmed from backend account');

    // 3. Refund bounty — transfer STRK from backend to user
    if (bountyAmount === 0n) {
      this.log.info({swapId}, 'No bounty to refund (amount is 0)');
      return {claimTxHash, claimedByBackend: true, refundTxHash: undefined, bountyAmount, userAddress};
    }

    const refundTxHash = await this.refundBounty(swapId, userAddress, bountyAmount);
    return {claimTxHash, claimedByBackend: true, refundTxHash, bountyAmount, userAddress};
  }

  /**
   * Checks whether a claim transaction was submitted by our backend account
   * by fetching the on-chain tx and comparing the sender address.
   * The Atomiq SDK silently returns the watchtower's tx hash when our claim
   * fails but the watchtower already claimed — this method detects that case.
   */
  private async isClaimTxFromBackend(claimTxHash: string): Promise<boolean> {
    try {
      // Account extends RpcProvider, so getTransaction is available directly
      const tx = await this.claimerAccount.getTransaction(claimTxHash);
      const senderAddress: string | undefined = (tx as {sender_address?: string}).sender_address;
      if (senderAddress === undefined) {
        this.log.warn({claimTxHash}, 'Could not determine claim tx sender, assuming backend');
        return true;
      }
      const normalizedSender = senderAddress.toLowerCase().replace(/^0x0*/, '0x');
      const normalizedBackend = this.config.claimer.address.toLowerCase().replace(/^0x0*/, '0x');
      return normalizedSender === normalizedBackend;
    } catch (error) {
      this.log.warn(
        {claimTxHash, cause: error instanceof Error ? error.message : String(error)},
        'Failed to verify claim tx sender, assuming backend',
      );
      return true;
    }
  }

  private async refundBounty(
    swapId: SwapId,
    userAddress: string,
    bountyAmount: bigint,
  ): Promise<string | undefined> {
    const low = `0x${(bountyAmount & ((1n << 128n) - 1n)).toString(16)}`;
    const high = `0x${(bountyAmount >> 128n).toString(16)}`;

    this.log.info({
      swapId,
      userAddress,
      bountyAmount: bountyAmount.toString(),
    }, 'Refunding claimer bounty to user');

    try {
      // Fetch a fresh nonce to avoid stale-nonce errors after the claim tx
      const nonce = await this.claimerAccount.getNonce('pending');
      const {transaction_hash} = await this.claimerAccount.execute(
        {
          contractAddress: this.config.strkTokenAddress,
          entrypoint: 'transfer',
          calldata: [userAddress, low, high],
        },
        {nonce},
      );

      this.log.info({swapId, txHash: transaction_hash, bountyAmount: bountyAmount.toString()}, 'Bounty refunded to user');
      return transaction_hash;
    } catch (error) {
      this.log.error({
        swapId,
        userAddress,
        bountyAmount: bountyAmount.toString(),
        cause: error instanceof Error ? error.message : String(error),
      }, 'CRITICAL: Failed to refund bounty to user — manual refund required');
      return undefined;
    }
  }

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  /**
   * Cleans up resources. Call when shutting down.
   */
  cleanup(): void {
    this.swapper = null;
    this.swapperFactory = null;
    this.isInitialized = false;
  }
}
