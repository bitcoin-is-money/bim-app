import {Injectable, signal} from '@angular/core';
import {isTerminalStatus, type StoredSwap, type SwapStatus} from '../model';

const STORAGE_KEY = 'bim:swaps';
const MAX_SWAPS = 50;
const MAX_AGE_DAYS = 7;

@Injectable({
  providedIn: 'root',
})
export class SwapStorageService {
  readonly swaps = signal<StoredSwap[]>([]);

  constructor() {
    this.loadFromStorage();
  }

  saveSwap(swap: StoredSwap): void {
    const current = this.swaps();
    const filtered = current.filter((s) => s.id !== swap.id);
    const updated = [swap, ...filtered];
    this.swaps.set(updated);
    this.persistToStorage(updated);
  }

  updateSwapStatus(swapId: string, status: SwapStatus): void {
    const current = this.swaps();
    const updated = current.map((swap) =>
      swap.id === swapId ? {...swap, lastKnownStatus: status} : swap
    );
    this.swaps.set(updated);
    this.persistToStorage(updated);
  }

  getSwap(swapId: string): StoredSwap | undefined {
    return this.swaps().find((s) => s.id === swapId);
  }

  getActiveSwaps(): StoredSwap[] {
    return this.swaps().filter((s) => !isTerminalStatus(s.lastKnownStatus));
  }

  removeOldSwaps(): void {
    const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
    const current = this.swaps();
    const filtered = current.filter((swap) => {
      const createdAt = new Date(swap.createdAt).getTime();
      return createdAt > cutoff || !isTerminalStatus(swap.lastKnownStatus);
    });

    const trimmed = filtered.slice(0, MAX_SWAPS);

    if (trimmed.length !== current.length) {
      this.swaps.set(trimmed);
      this.persistToStorage(trimmed);
    }
  }

  private loadFromStorage(): void {
    let swaps: StoredSwap[] = [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          /* eslint-disable @typescript-eslint/no-unsafe-member-access -- type guard narrowing from unknown */
          swaps = parsed.filter(
            (item): item is StoredSwap =>
              typeof item === 'object' && item !== null
              && typeof item.id === 'string'
              && typeof item.lastKnownStatus === 'string'
              && typeof item.createdAt === 'string',
          );
          /* eslint-enable @typescript-eslint/no-unsafe-member-access */
        }
      }
    } catch {
      console.error('Failed to load swaps from localStorage');
    }
    this.swaps.set(swaps);
    this.removeOldSwaps();
  }

  private persistToStorage(swaps: StoredSwap[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(swaps));
    } catch {
      console.error('Failed to persist swaps to localStorage');
    }
  }
}
