import type {StarknetAddress} from '../shared';
import type {PreparedCalls} from './pay.types';

/**
 * Data stored for a pending payment build (between /build and /execute).
 */
export interface PaymentBuildData {
  /** The prepared calls and payment metadata from PayService.prepareCalls() */
  preparedCalls: PreparedCalls;
  /** The SNIP-29 OutsideExecution typed data from AVNU paymaster */
  typedData: unknown;
  /** The sender's Starknet address */
  senderAddress: StarknetAddress;
  /** The account ID (for saving transaction description) */
  accountId: string;
  /** Payment description (user-provided or empty) */
  description: string;
  /** When this build was created */
  createdAt: number;
  /** When true, a Slack notification is sent after successful execution */
  isDonation?: boolean;
}

/**
 * In-memory TTL cache for payment builds.
 *
 * Stores data between the /build and /execute steps.
 * Each entry is single-use (consumed on execute) and expires after 5 minutes.
 */
export class PaymentBuildCache {
  private static readonly TTL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly cache = new Map<string, PaymentBuildData>();

  /**
   * Stores a payment build with a unique ID.
   */
  set(id: string, data: PaymentBuildData): void {
    this.cache.set(id, data);
    this.cleanup();
  }

  /**
   * Retrieves and removes a payment build (single-use).
   * Returns null if not found or expired.
   */
  consume(id: string): PaymentBuildData | null {
    const entry = this.cache.get(id);
    if (!entry) return null;

    this.cache.delete(id);

    if (Date.now() - entry.createdAt > PaymentBuildCache.TTL_MS) {
      return null;
    }

    return entry;
  }

  /**
   * Removes expired entries.
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now - entry.createdAt > PaymentBuildCache.TTL_MS) {
        this.cache.delete(key);
      }
    }
  }
}
