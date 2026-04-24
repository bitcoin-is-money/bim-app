import type {Swap} from '../swap';
import type {SwapStatus} from '../types';

export interface FetchSwapStatusInput {
  swapId: string;
  accountId: string;
}

export interface FetchSwapStatusOutput {
  swap: Swap;
  status: SwapStatus;
  progress: number;
  txHash?: string;
}

/**
 * Fetches the current status of a swap, syncing with Atomiq if not terminal.
 */
export interface FetchSwapStatusUseCase {
  fetchStatus(input: FetchSwapStatusInput): Promise<FetchSwapStatusOutput>;
}
