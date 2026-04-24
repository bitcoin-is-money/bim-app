import type {AtomiqGateway} from '@bim/domain/ports';
import type {FetchSwapStatusUseCase, Swap, SwapCoordinator, SwapId} from '@bim/domain/swap';
import {serializeError} from '@bim/lib/error';

import type {Logger} from 'pino';

/**
 * Configuration for the SwapMonitor.
 */
export interface SwapMonitorConfig {
  /** Polling interval in milliseconds (default: 5000) */
  pollInterval?: number;
  /** Number of consecutive idle iterations before auto-stopping (default: 30, ~2.5 min) */
  maxIdleIterations?: number;
  /**
   * Public URL of the container.
   * The monitor sends a keepalive request every keepaliveIntervalIterations
   * while swaps are active, preventing serverless scale-to-zero.
   */
  keepaliveUrl: string;
  /** Number of iterations between keepalive pings (default: 60, ~5 min at 5s poll) */
  keepaliveIntervalIterations?: number;
  /**
   * Minimum delay between consecutive claim submissions for the same swap
   * (default: 120_000, 2 min). While a claim tx is in flight, Atomiq still
   * reports the swap as `claimable`; the cooldown prevents re-submission
   * until either the tx is mined (Atomiq → completed) or the cooldown
   * expires (previous tx assumed dropped, retry).
   */
  claimCooldownMs?: number;
}

const DEFAULT_POLL_INTERVAL = 5000;
const DEFAULT_MAX_IDLE_ITERATIONS = 30;
const DEFAULT_KEEPALIVE_INTERVAL_ITERATIONS = 60;
const DEFAULT_CLAIM_COOLDOWN_MS = 2 * 60 * 1000;

/**
 * Background monitor that polls active swaps, syncs their status
 * with Atomiq, and auto-claims forward swaps when paid.
 *
 * This class is a pure orchestrator — it contains no business logic.
 * It delegates to SwapReader (fetchStatus) and SwapCoordinator
 * (getActiveSwaps, recordClaimAttempt) for all operations.
 *
 * Designed to be extractable to a separate process in the future:
 * the same methods can be exposed as internal HTTP endpoints.
 */
export class SwapMonitor {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private iterating = false;
  private idleIterations = 0;
  private iterationsSinceLastKeepalive = 0;
  private readonly knownActiveSwapIds = new Set<SwapId>();
  private readonly config: Required<SwapMonitorConfig>;
  private readonly log: Logger;

  constructor(
    private readonly swapReader: FetchSwapStatusUseCase,
    private readonly swapCoordinator: SwapCoordinator,
    private readonly atomiqGateway: AtomiqGateway,
    rootLogger: Logger,
    config: SwapMonitorConfig,
  ) {
    this.config = {
      pollInterval: config.pollInterval ?? DEFAULT_POLL_INTERVAL,
      maxIdleIterations: config.maxIdleIterations ?? DEFAULT_MAX_IDLE_ITERATIONS,
      keepaliveUrl: config.keepaliveUrl,
      keepaliveIntervalIterations: config.keepaliveIntervalIterations ?? DEFAULT_KEEPALIVE_INTERVAL_ITERATIONS,
      claimCooldownMs: config.claimCooldownMs ?? DEFAULT_CLAIM_COOLDOWN_MS,
    };
    this.log = rootLogger.child({name: 'swap.monitor.ts'});
  }

  /**
   * Starts the background polling loop.
   */
  start(): void {
    if (this.running) return;
    this.log.info('Starting SwapMonitor');
    this.running = true;
    this.idleIterations = 0;
    this.timer = setInterval(() => void this.runIteration(), this.config.pollInterval);
  }

  /**
   * Ensures the monitor is running. Call after creating a swap.
   * No-op if already running.
   */
  ensureRunning(): void {
    this.start();
  }

  /**
   * Stops the background polling loop.
   * Waits for the current iteration to finish if one is in progress.
   */
  async stop(): Promise<void> {
    this.running = false;
    this.log.info('Stopping SwapMonitor');
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    // Wait for the current iteration to complete
    while (this.iterating) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  /**
   * Runs a single monitoring iteration. Exposed for testing.
   */
  async runIteration(): Promise<void> {
    if (this.iterating) return;
    this.iterating = true;
    this.log.trace('Running iteration');
    try {
      const activeSwaps = await this.swapCoordinator.getActiveSwaps();

      if (activeSwaps.length === 0) {
        await this.handleIdleIteration();
        return;
      }

      this.idleIterations = 0;
      this.trackActiveSwaps(activeSwaps);
      await this.keepaliveIfNeeded(activeSwaps.length);

      for (const swap of activeSwaps) {
        await this.processActiveSwap(swap);
      }
    } catch (err) {
      this.log.error(
        {cause: serializeError(err)},
        'SwapMonitor iteration error',
      );
    } finally {
      this.iterating = false;
    }
  }

  private async handleIdleIteration(): Promise<void> {
    this.knownActiveSwapIds.clear();
    this.idleIterations++;
    if (this.idleIterations >= this.config.maxIdleIterations) {
      this.log.info(`No active swaps, auto-stopping SwapMonitor after ${this.idleIterations} idle iterations`);
      this.iterating = false;
      await this.stop();
    }
  }

  private trackActiveSwaps(activeSwaps: Swap[]): void {
    const currentIds = new Set<SwapId>(activeSwaps.map(s => s.data.id));
    const newIds = [...currentIds].filter(id => !this.knownActiveSwapIds.has(id));
    if (newIds.length > 0) {
      this.log.info(
        {count: activeSwaps.length, newSwapIds: newIds},
        'New active swap(s) detected',
      );
    }
    for (const id of this.knownActiveSwapIds) {
      if (!currentIds.has(id)) {
        this.knownActiveSwapIds.delete(id);
      }
    }
    for (const id of newIds) {
      this.knownActiveSwapIds.add(id);
    }
  }

  private async processActiveSwap(swap: Swap): Promise<void> {
    try {
      const {swap: syncedSwap, status} = await this.swapReader.fetchStatus({
        swapId: swap.data.id,
        accountId: swap.data.accountId,
      });
      this.log.debug({swapId: swap.data.id, status}, 'Swap status');

      // Auto-claim forward swaps (Bitcoin/Lightning → Starknet) when claimable.
      // The backend account submits the claim tx and receives the claimer bounty.
      // Without this, the watchtower claims and the user loses the bounty.
      if (status === 'claimable' && syncedSwap.isForward() && this.canClaim(syncedSwap)) {
        await this.claimSwap(syncedSwap.data.id);
      }
    } catch (err) {
      // Individual swap errors are non-fatal — continue with the next swap
      this.log.warn({
        swapId: swap.data.id,
        cause: serializeError(err),
      }, 'Unexpected behavior processing swap, skipping');
    }
  }

  /**
   * Sends a keepalive HTTP request to the container's own public URL
   * to prevent serverless scale-to-zero while swaps are active.
   * Only pings every keepaliveIntervalIterations (~5 min).
   */
  private async keepaliveIfNeeded(activeSwapCount: number): Promise<void> {
    this.iterationsSinceLastKeepalive++;
    if (this.iterationsSinceLastKeepalive < this.config.keepaliveIntervalIterations) return;

    this.iterationsSinceLastKeepalive = 0;
    const url = `${this.config.keepaliveUrl}/api/health/live`;

    this.log.info(
      {activeSwapCount, url},
      `${activeSwapCount} active swap(s) — sending keepalive to prevent container scale-down`,
    );

    try {
      await fetch(url, {signal: AbortSignal.timeout(5000)});
    } catch (err) {
      this.log.warn(
        {url, cause: serializeError(err)},
        'Keepalive request failed',
      );
    }
  }

  /**
   * Returns false if a claim tx was submitted for this swap within the
   * configured cooldown window. Prevents double-submission while Atomiq has
   * not yet reflected the on-chain result.
   */
  private canClaim(swap: Swap): boolean {
    if (!swap.hasRecentClaimAttempt(this.config.claimCooldownMs)) {
      return true;
    }
    this.log.debug(
      {swapId: swap.data.id, cooldownMs: this.config.claimCooldownMs},
      'Skipping claim, previous attempt still within cooldown',
    );
    return false;
  }

  private async claimSwap(swapId: SwapId): Promise<void> {
    this.log.info({swapId}, 'Auto-claiming forward swap');
    try {
      const result = await this.atomiqGateway.claimForwardSwap(swapId);
      this.log.info({
        swapId,
        claimTxHash: result.claimTxHash,
        claimedByBackend: result.claimedByBackend,
        refundTxHash: result.refundTxHash,
        bountyAmount: result.bountyAmount.toString(),
        userAddress: result.userAddress,
        refundSuccess: result.refundTxHash !== undefined,
      }, 'Forward swap claim completed');

      // Record the attempt so subsequent iterations respect the cooldown.
      // The status stays `claimable` — Atomiq will transition it to
      // `completed` on its own once the tx is mined.
      await this.swapCoordinator.recordClaimAttempt(swapId, result.claimTxHash);
    } catch (err) {
      this.log.error({
        swapId,
        cause: serializeError(err),
      }, 'Failed to claim forward swap');
    }
  }
}
