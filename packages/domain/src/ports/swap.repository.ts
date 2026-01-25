import {Swap, type SwapDirection, SwapId, type SwapStatus} from '../swap';

/**
 * Repository interface for Swap persistence.
 * Swaps can be stored in-memory for ephemeral data or in a database for persistence.
 */
export interface SwapRepository {
  /**
   * Saves a swap.
   */
  save(swap: Swap): Promise<void>;

  /**
   * Finds a swap by its ID.
   */
  findById(id: SwapId): Promise<Swap | undefined>;

  /**
   * Finds all swaps with a given status.
   */
  findByStatus(status: SwapStatus): Promise<Swap[]>;

  /**
   * Finds all swaps for a destination address.
   */
  findByDestinationAddress(address: string): Promise<Swap[]>;

  /**
   * Finds all active (non-terminal) swaps.
   */
  findActive(): Promise<Swap[]>;

  /**
   * Finds swaps by direction.
   */
  findByDirection(direction: SwapDirection): Promise<Swap[]>;

  /**
   * Deletes a swap by ID.
   */
  delete(id: SwapId): Promise<void>;

  /**
   * Deletes all expired swaps older than a given date.
   */
  deleteExpiredBefore(date: Date): Promise<number>;
}
