import {isForwardSwap, type SwapDirection, type SwapService, type SwapStatus} from '@bim/domain/swap';
import {basename} from 'node:path';
import type {Logger} from 'pino';

/**
 * Configuration for the SwapMonitor.
 */
export interface SwapMonitorConfig {
  /** Polling interval in milliseconds (default: 5000) */
  pollInterval?: number;
  /** Maximum claim retries per swap before giving up (default: 3) */
  maxClaimRetries?: number;
}

const DEFAULT_CONFIG: Required<SwapMonitorConfig> = {
  pollInterval: 5000,
  maxClaimRetries: 3,
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
  private readonly config: Required<SwapMonitorConfig>;
  private readonly claimRetries = new Map<string, number>();
  private readonly log: Logger;

  constructor(
    private readonly swapService: SwapService,
    rootLogger: Logger,
    config?: SwapMonitorConfig,
  ) {
    this.config = {...DEFAULT_CONFIG, ...config};
    this.log = rootLogger.child({name: basename(import.meta.filename)});
  }

  /**
   * Starts the background polling loop.
   */
  start(): void {
    if (this.running) return;
    this.log.info('Starting SwapMonitor');
    this.running = true;
    this.timer = setInterval(() => this.runIteration(), this.config.pollInterval);
    this.log.debug('SwapMonitor started');
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
      for (const swap of activeSwaps) {
        try {
          const {status} = await this.swapService.fetchStatus({swapId: swap.id});
          this.log.debug({swapId: swap.id, status}, `Swap status`);
          await this.autoClaimIfNeeded(swap.id, status, swap.direction);
        } catch (err) {
          // Individual swap errors are non-fatal — continue with the next swap
          this.log.warn({
            cause: err instanceof Error ? err.message : String(err)
          }, "Unexpected behavior fetching swap status, skipping");
        }
      }
    } catch (err) {
      this.log.error({err: err}, 'SwapMonitor iteration error');
    } finally {
      this.iterating = false;
    }
  }

  private async autoClaimIfNeeded(
    swapId: string,
    status: SwapStatus,
    direction: SwapDirection,
  ): Promise<void> {
    if (status !== 'paid') {
      this.log.debug(`autoClaimIfNeeded, status !== paid, skipping (status: ${status})`);
      return;
    }
    if (!isForwardSwap(direction)) {
      this.log.debug(`isForwardSwap(${direction}) is false, skipping (status: ${status})`);
      return;
    }

    const retries = this.claimRetries.get(swapId) ?? 0;
    if (retries >= this.config.maxClaimRetries) {
      this.log.warn(`maxClaim retries (${retries}), skipping (status: ${status})`);
      return;
    }

    try {
      this.log.info({swapId}, 'Auto-claiming swap (paid)');
      await this.swapService.claim({swapId});
      this.claimRetries.delete(swapId);
    } catch {
      this.claimRetries.set(swapId, retries + 1);
      this.log.warn({
        swapId, retries: retries + 1,
        maxRetries: this.config.maxClaimRetries
      }, 'Swap claim failed, will retry');
    }
  }
}
