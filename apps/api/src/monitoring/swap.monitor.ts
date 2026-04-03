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
}

const DEFAULT_CONFIG: Required<SwapMonitorConfig> = {
  pollInterval: 5000,
  maxIdleIterations: 30,
};

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
  private readonly config: Required<SwapMonitorConfig>;
  private readonly log: Logger;

  constructor(
    private readonly swapService: SwapService,
    private readonly atomiqGateway: AtomiqGateway,
    rootLogger: Logger,
    config?: SwapMonitorConfig,
  ) {
    this.config = {...DEFAULT_CONFIG, ...config};
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
