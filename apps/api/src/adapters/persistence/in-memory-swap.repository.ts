import {Swap, type SwapDirection, SwapId, type SwapRepository, type SwapStatus,} from '@bim/domain';

/**
 * In-memory implementation of SwapRepository.
 * Used for ephemeral swap data that doesn't need to persist across restarts.
 */
export class InMemorySwapRepository implements SwapRepository {
  private readonly swaps: Map<string, Swap> = new Map();

  async save(swap: Swap): Promise<void> {
    this.swaps.set(swap.id, swap);
  }

  async findById(id: SwapId): Promise<Swap | undefined> {
    return this.swaps.get(id);
  }

  async findByStatus(status: SwapStatus): Promise<Swap[]> {
    const result: Swap[] = [];
    for (const swap of this.swaps.values()) {
      if (swap.getStatus() === status) {
        result.push(swap);
      }
    }
    return result;
  }

  async findByDestinationAddress(address: string): Promise<Swap[]> {
    const normalizedAddress = address.toLowerCase();
    const result: Swap[] = [];
    for (const swap of this.swaps.values()) {
      if (swap.destinationAddress.toLowerCase() === normalizedAddress) {
        result.push(swap);
      }
    }
    return result;
  }

  async findActive(): Promise<Swap[]> {
    const result: Swap[] = [];
    for (const swap of this.swaps.values()) {
      if (!swap.isTerminal()) {
        result.push(swap);
      }
    }
    return result;
  }

  async findByDirection(direction: SwapDirection): Promise<Swap[]> {
    const result: Swap[] = [];
    for (const swap of this.swaps.values()) {
      if (swap.direction === direction) {
        result.push(swap);
      }
    }
    return result;
  }

  async delete(id: SwapId): Promise<void> {
    this.swaps.delete(id);
  }

  async deleteExpiredBefore(date: Date): Promise<number> {
    let count = 0;
    for (const [id, swap] of this.swaps.entries()) {
      if (swap.isExpired() && swap.createdAt < date) {
        this.swaps.delete(id);
        count++;
      }
    }
    return count;
  }

  /**
   * Clears all swaps. Useful for testing.
   */
  clear(): void {
    this.swaps.clear();
  }

  /**
   * Gets the total number of swaps.
   */
  size(): number {
    return this.swaps.size;
  }
}
