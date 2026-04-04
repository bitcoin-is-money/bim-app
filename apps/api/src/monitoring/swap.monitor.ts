import type {AtomiqGateway} from '@bim/domain/ports';
import type {SwapId, SwapService} from '@bim/domain/swap';

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
}

const DEFAULT_POLL_INTERVAL = 5000;
const DEFAULT_MAX_IDLE_ITERATIONS = 30;
const DEFAULT_KEEPALIVE_INTERVAL_ITERATIONS = 60;

/**
 * Background monitor that polls active swaps, syncs their status
 * with Atomiq, and auto-claims forward swaps when paid.
 *
 * This class is a pure orchestrator — it contains no business logic.
 * It calls SwapService methods to perform all operations.
 *
 * Designed to be extractable to a separate process in the future:
 * the same SwapService methods can be exposed as internal HTTP endpoints.
 */
export class SwapMonitor {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private iterating = false;
  private idleIterations = 0;
  private iterationsSinceLastKeepalive = 0;
  private readonly config: Required<SwapMonitorConfig>;
  private readonly log: Logger;

  constructor(
    private readonly swapService: SwapService,
    private readonly atomiqGateway: AtomiqGateway,
    rootLogger: Logger,
    config: SwapMonitorConfig,
  ) {
    this.config = {
      pollInterval: config.pollInterval ?? DEFAULT_POLL_INTERVAL,
      maxIdleIterations: config.maxIdleIterations ?? DEFAULT_MAX_IDLE_ITERATIONS,
      keepaliveUrl: config.keepaliveUrl,
      keepaliveIntervalIterations: config.keepaliveIntervalIterations ?? DEFAULT_KEEPALIVE_INTERVAL_ITERATIONS,
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
      const activeSwaps = await this.swapService.getActiveSwaps();

      if (activeSwaps.length === 0) {
        this.idleIterations++;
        if (this.idleIterations >= this.config.maxIdleIterations) {
          this.log.info({idleIterations: this.idleIterations}, 'No active swaps, auto-stopping SwapMonitor');
          this.iterating = false;
          await this.stop();
          return;
        }
        return;
      }

      this.idleIterations = 0;
      await this.keepaliveIfNeeded(activeSwaps.length);

      for (const swap of activeSwaps) {
        try {
          const {status} = await this.swapService.fetchStatus({
            swapId: swap.data.id,
            accountId: swap.data.accountId,
          });
          this.log.debug({swapId: swap.data.id, status}, 'Swap status');

          // Auto-claim forward swaps (Bitcoin/Lightning → Starknet) when claimable.
          // The backend account submits the claim tx and receives the claimer bounty.
          // Without this, the watchtower claims and the user loses the bounty.
          if (status === 'claimable' && swap.isForward()) {
            await this.claimSwap(swap.data.id);
          }
        } catch (err) {
          // Individual swap errors are non-fatal — continue with the next swap
          this.log.warn({
            swapId: swap.data.id,
            cause: err instanceof Error ? err.message : String(err),
          }, 'Unexpected behavior processing swap, skipping');
        }
      }
    } catch (err) {
      this.log.error({err}, 'SwapMonitor iteration error');
    } finally {
      this.iterating = false;
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
        {url, cause: err instanceof Error ? err.message : String(err)},
        'Keepalive request failed',
      );
    }
  }

  private async claimSwap(swapId: SwapId): Promise<void> {
    this.log.info({swapId}, 'Auto-claiming forward swap');
    try {
      const result = await this.atomiqGateway.claimForwardSwap(swapId);
      this.log.info({
        swapId,
        claimTxHash: result.claimTxHash,
        refundTxHash: result.refundTxHash,
        bountyAmount: result.bountyAmount.toString(),
        userAddress: result.userAddress,
        refundSuccess: result.refundTxHash !== undefined,
      }, 'Forward swap claim completed');

      // Transition to confirming so the monitor won't re-attempt the claim
      await this.swapService.markSwapAsConfirming(swapId, result.claimTxHash);
    } catch (err) {
      this.log.error({
        swapId,
        cause: err instanceof Error ? err.message : String(err),
      }, 'Failed to claim forward swap');
    }
  }
}
