import {StarknetAddress} from '@bim/domain/account';
import {Amount} from '@bim/domain/shared';
import {Swap, SwapId, type SwapService} from '@bim/domain/swap';
import {createLogger} from '@bim/lib/logger';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {SwapMonitor} from '../../../src/monitoring/swap.monitor';

const DESTINATION = StarknetAddress.of('0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
const INVOICE = 'lntb1000n1pjtest0pp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypq';

function createLightningSwap(id: string): Swap {
  return Swap.createLightningToStarknet({
    id: SwapId.of(id),
    amount: Amount.ofSatoshi(50_000n),
    destinationAddress: DESTINATION,
    invoice: INVOICE,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
  });
}

function createMockSwapService(): SwapService {
  return {
    getActiveSwaps: vi.fn().mockResolvedValue([]),
    fetchStatus: vi.fn(),
    claim: vi.fn(),
    createLightningToStarknet: vi.fn(),
    createBitcoinToStarknet: vi.fn(),
    createStarknetToLightning: vi.fn(),
    createStarknetToBitcoin: vi.fn(),
    fetchLimits: vi.fn(),
  } as unknown as SwapService;
}

describe('SwapMonitor', () => {
  let monitor: SwapMonitor;
  let swapService: SwapService;

  beforeEach(() => {
    swapService = createMockSwapService();
    monitor = new SwapMonitor(swapService, createLogger(), {pollInterval: 100});
  });

  describe('runIteration', () => {
    it('fetches active swaps and syncs their status', async () => {
      const swap = createLightningSwap('s1');
      vi.mocked(swapService.getActiveSwaps).mockResolvedValue([swap]);
      vi.mocked(swapService.fetchStatus).mockResolvedValue({
        swap,
        status: 'pending',
        progress: 0,
      });

      await monitor.runIteration();

      expect(swapService.getActiveSwaps).toHaveBeenCalledOnce();
      expect(swapService.fetchStatus).toHaveBeenCalledWith({swapId: 's1'});
    });

    it('does not call claim — LP/watchtower handles claiming cooperatively', async () => {
      const swap = createLightningSwap('s1');
      vi.mocked(swapService.getActiveSwaps).mockResolvedValue([swap]);
      vi.mocked(swapService.fetchStatus).mockResolvedValue({
        swap,
        status: 'paid',
        progress: 33,
      });

      await monitor.runIteration();

      expect(swapService.claim).not.toHaveBeenCalled();
    });

    it('continues processing other swaps when one fails', async () => {
      const swap1 = createLightningSwap('s1');
      const swap2 = createLightningSwap('s2');
      vi.mocked(swapService.getActiveSwaps).mockResolvedValue([swap1, swap2]);
      vi.mocked(swapService.fetchStatus)
        .mockRejectedValueOnce(new Error('SDK error'))
        .mockResolvedValueOnce({swap: swap2, status: 'pending', progress: 0});

      await monitor.runIteration();

      expect(swapService.fetchStatus).toHaveBeenCalledTimes(2);
    });
  });

  describe('start / stop', () => {
    it('starts and stops without errors', async () => {
      vi.mocked(swapService.getActiveSwaps).mockResolvedValue([]);

      monitor.start();
      // Let at least one tick happen
      await new Promise(resolve => setTimeout(resolve, 150));
      await monitor.stop();

      expect(swapService.getActiveSwaps).toHaveBeenCalled();
    });

    it('does not start twice', () => {
      vi.mocked(swapService.getActiveSwaps).mockResolvedValue([]);

      monitor.start();
      monitor.start(); // second call is a no-op

      monitor.stop();
    });
  });
});
