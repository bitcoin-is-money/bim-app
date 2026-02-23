import type {StarknetAddress} from '@bim/domain/account';
import type {Amount} from '@bim/domain/shared';

/**
 * Data stored for a pending Bitcoin receive build (between POST /receive and POST /receive/commit).
 */
export interface ReceiveBuildData {
  /** The Atomiq swap ID */
  swapId: string;
  /** The SNIP-29 OutsideExecution typed data from AVNU paymaster */
  typedData: unknown;
  /** The receiver's Starknet address */
  senderAddress: StarknetAddress;
  /** The account ID */
  accountId: string;
  /** The receive amount */
  amount: Amount;
  /** Quote expiry */
  expiresAt: Date;
  /** Optional description */
  description?: string;
  /** Whether to use BIP21 URI prefix */
  useUriPrefix: boolean;
  /** When this build was created */
  createdAt: number;
}

/**
 * In-memory TTL cache for Bitcoin receive builds.
 *
 * Stores data between the /receive and /receive/commit steps.
 * Each entry is single-use (consumed on commit) and expires after 5 minutes.
 */
export class ReceiveBuildCache {
  private static readonly TTL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly cache = new Map<string, ReceiveBuildData>();

  set(id: string, data: ReceiveBuildData): void {
    this.cache.set(id, data);
    this.cleanup();
  }

  consume(id: string): ReceiveBuildData | null {
    const entry = this.cache.get(id);
    if (!entry) return null;

    this.cache.delete(id);

    if (Date.now() - entry.createdAt > ReceiveBuildCache.TTL_MS) {
      return null;
    }

    return entry;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now - entry.createdAt > ReceiveBuildCache.TTL_MS) {
        this.cache.delete(key);
      }
    }
  }
}
