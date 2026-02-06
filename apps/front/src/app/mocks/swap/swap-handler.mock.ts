import {HttpResponse} from '@angular/common/http';
import type {SwapStatus, SwapStatusResponse} from '../../model';
import {DataStoreMock} from '../data-store.mock';

/** Predefined statuses for bob's existing swaps */
const PREDEFINED_SWAP_STATUSES: Record<string, SwapStatus> = {
  'swap-bob-completed': 'completed',
  'swap-bob-confirming': 'confirming',
  'swap-bob-paid': 'paid',
  'swap-bob-pending': 'pending',
  'swap-bob-expired': 'expired',
  'swap-bob-failed': 'failed',
};

function getProgressForStatus(status: SwapStatus): number {
  switch (status) {
    case 'pending': return 0;
    case 'paid': return 33;
    case 'confirming': return 66;
    case 'completed': return 100;
    case 'expired':
    case 'failed': return 0;
  }
}

export class SwapHandlerMock {
  constructor(private readonly store: DataStoreMock) {}

  getStatus(swapId: string): HttpResponse<SwapStatusResponse | {error: {message: string}}> {
    const profile = this.store.getMockUserProfile();

    // Check if it's a predefined swap (bob's existing swaps)
    if (swapId in PREDEFINED_SWAP_STATUSES) {
      const status = PREDEFINED_SWAP_STATUSES[swapId]!;
      const body: SwapStatusResponse = {
        swapId,
        direction: swapId.includes('lightning')
          ? 'lightning_to_starknet'
          : 'starknet_to_bitcoin',
        status,
        progress: getProgressForStatus(status),
        amountSats: '50000',
        destinationAddress: '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      };
      if (status === 'completed' || status === 'confirming') {
        body.txHash = '0xmocktxhash' + swapId;
      }
      return new HttpResponse({status: 200, body});
    }

    // Check if it's a swap created during this session
    const swap = this.store.getSwap(swapId);
    if (!swap) {
      return new HttpResponse({
        status: 404,
        body: {error: {message: 'Swap not found'}},
      });
    }

    // Get current poll count and determine status from progression
    const pollCount = this.store.incrementPollCount(swapId);
    const progression = profile.swapConfig.statusProgression;
    const statusIndex = Math.min(pollCount, progression.length - 1);
    const status = progression[statusIndex]!;

    const body: SwapStatusResponse = {
      swapId,
      direction: swap.direction,
      status,
      progress: getProgressForStatus(status),
      amountSats: String(swap.amountSats),
      destinationAddress: swap.destinationAddress,
      expiresAt: swap.expiresAt,
    };
    if (status === 'completed' || status === 'confirming') {
      body.txHash = '0xmocktxhash' + swapId;
    }
    return new HttpResponse({status: 200, body});
  }
}
