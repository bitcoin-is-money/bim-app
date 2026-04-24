import {StarknetAddress} from '@bim/domain/account';
import type {AtomiqGateway} from '@bim/domain/ports';
import {Amount} from '@bim/domain/shared';
import {
  type LightningInvoice,
  Swap,
  type SwapCoordinator,
  SwapId,
  type SwapReader,
} from '@bim/domain/swap';
import {createLogger} from '@bim/lib/logger';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {SwapMonitor} from '../../../src/monitoring/swap.monitor';

const DESTINATION = StarknetAddress.of('0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
const INVOICE = 'lntb1000n1pjtest0pp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypq';

function createLightningSwap(id: string): Swap {
  return Swap.createLightningToStarknet({
    id: SwapId.of(id),
    amount: Amount.ofSatoshi(50_000n),
    destinationAddress: DESTINATION,
    invoice: INVOICE,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    description: 'Received',
    accountId: 'account-001',
  });
}

function createMockSwapReader(): SwapReader {
  return {
    fetchStatus: vi.fn(),
    fetchLimits: vi.fn(),
  } as unknown as SwapReader;
}

function createMockSwapCoordinator(): SwapCoordinator {
  return {
    getActiveSwaps: vi.fn().mockResolvedValue([]),
    recordClaimAttempt: vi.fn().mockResolvedValue(undefined),
    createLightningToStarknet: vi.fn(),
    prepareBitcoinToStarknet: vi.fn(),
    saveBitcoinCommit: vi.fn(),
    completeBitcoinToStarknet: vi.fn(),
    createStarknetToLightning: vi.fn(),
    createStarknetToBitcoin: vi.fn(),
  } as unknown as SwapCoordinator;
}

function createMockAtomiqGateway(): AtomiqGateway {
  return {
    claimForwardSwap: vi.fn().mockResolvedValue({
      claimTxHash: '0xclaim_tx',
      claimedByBackend: true,
      refundTxHash: '0xrefund_tx',
      bountyAmount: 80_000_000_000_000_000_000n,
      userAddress: '0x0123456789abcdef',
    }),
  } as unknown as AtomiqGateway;
}

describe('SwapMonitor', () => {
  let monitor: SwapMonitor;
  let swapReader: SwapReader;
  let swapCoordinator: SwapCoordinator;
  let atomiqGateway: AtomiqGateway;

  beforeEach(() => {
    swapReader = createMockSwapReader();
    swapCoordinator = createMockSwapCoordinator();
    atomiqGateway = createMockAtomiqGateway();
    monitor = new SwapMonitor(swapReader, swapCoordinator, atomiqGateway, createLogger(), {keepaliveUrl: 'http://localhost:8080', pollInterval: 100});
  });

  describe('runIteration', () => {
    it('fetches active swaps and syncs their status', async () => {
      const swap = createLightningSwap('s1');
      vi.mocked(swapCoordinator.getActiveSwaps).mockResolvedValue([swap]);
      vi.mocked(swapReader.fetchStatus).mockResolvedValue({
        swap,
        status: 'pending',
        progress: 0,
      });

      await monitor.runIteration();

      expect(swapCoordinator.getActiveSwaps).toHaveBeenCalledOnce();
      expect(swapReader.fetchStatus).toHaveBeenCalledWith({swapId: 's1', accountId: 'account-001'});
    });

    it('continues processing other swaps when one fails', async () => {
      const swap1 = createLightningSwap('s1');
      const swap2 = createLightningSwap('s2');
      vi.mocked(swapCoordinator.getActiveSwaps).mockResolvedValue([swap1, swap2]);
      vi.mocked(swapReader.fetchStatus)
        .mockRejectedValueOnce(new Error('SDK error'))
        .mockResolvedValueOnce({swap: swap2, status: 'pending', progress: 0});

      await monitor.runIteration();

      expect(swapReader.fetchStatus).toHaveBeenCalledTimes(2);
    });
  });

  describe('start / stop', () => {
    it('starts and stops without errors', async () => {
      vi.mocked(swapCoordinator.getActiveSwaps).mockResolvedValue([]);

      monitor.start();
      await new Promise(resolve => setTimeout(resolve, 150));
      await monitor.stop();

      expect(swapCoordinator.getActiveSwaps).toHaveBeenCalled();
    });

    it('does not start twice', async () => {
      vi.mocked(swapCoordinator.getActiveSwaps).mockResolvedValue([]);

      expect(() => {
        monitor.start();
        monitor.start();
      }).not.toThrow();

      await monitor.stop();
    });
  });

  describe('auto-stop', () => {
    it('stops after maxIdleIterations with no active swaps', async () => {
      const autoStopMonitor = new SwapMonitor(swapReader, swapCoordinator, atomiqGateway, createLogger(), {
        keepaliveUrl: 'http://localhost:8080',
        pollInterval: 100,
        maxIdleIterations: 3,
      });
      vi.mocked(swapCoordinator.getActiveSwaps).mockResolvedValue([]);

      autoStopMonitor.start();
      await new Promise(resolve => setTimeout(resolve, 500));

      vi.mocked(swapCoordinator.getActiveSwaps).mockClear();
      autoStopMonitor.start();
      await new Promise(resolve => setTimeout(resolve, 150));
      await autoStopMonitor.stop();

      expect(swapCoordinator.getActiveSwaps).toHaveBeenCalled();
    });

    it('resets idle counter when active swaps are found', async () => {
      const autoStopMonitor = new SwapMonitor(swapReader, swapCoordinator, atomiqGateway, createLogger(), {
        keepaliveUrl: 'http://localhost:8080',
        pollInterval: 100,
        maxIdleIterations: 3,
      });
      const swap = createLightningSwap('s1');

      vi.mocked(swapCoordinator.getActiveSwaps)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([swap])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValue([]);

      vi.mocked(swapReader.fetchStatus).mockResolvedValue({swap, status: 'pending', progress: 0});

      autoStopMonitor.start();
      await new Promise(resolve => setTimeout(resolve, 800));
      await autoStopMonitor.stop();

      expect(swapCoordinator.getActiveSwaps).toHaveBeenCalledTimes(6);
    });
  });

  describe('auto-claim', () => {
    it('claims forward swap when status is claimable', async () => {
      const swap = createLightningSwap('s1');
      vi.mocked(swapCoordinator.getActiveSwaps).mockResolvedValue([swap]);
      vi.mocked(swapReader.fetchStatus).mockResolvedValue({
        swap,
        status: 'claimable',
        progress: 50,
      });

      await monitor.runIteration();

      expect(atomiqGateway.claimForwardSwap).toHaveBeenCalledWith('s1');
      expect(swapCoordinator.recordClaimAttempt).toHaveBeenCalledWith('s1', '0xclaim_tx');
    });

    it('does NOT re-claim a swap that has a recent claim attempt within cooldown', async () => {
      const swap = createLightningSwap('s1');
      swap.recordClaimAttempt('0xprevious_claim');
      vi.mocked(swapCoordinator.getActiveSwaps).mockResolvedValue([swap]);
      vi.mocked(swapReader.fetchStatus).mockResolvedValue({
        swap,
        status: 'claimable',
        progress: 50,
      });

      await monitor.runIteration();

      expect(atomiqGateway.claimForwardSwap).not.toHaveBeenCalled();
      expect(swapCoordinator.recordClaimAttempt).not.toHaveBeenCalled();
    });

    it('does NOT claim forward swap when status is paid (not yet claimable)', async () => {
      const swap = createLightningSwap('s1');
      vi.mocked(swapCoordinator.getActiveSwaps).mockResolvedValue([swap]);
      vi.mocked(swapReader.fetchStatus).mockResolvedValue({
        swap,
        status: 'paid',
        progress: 33,
      });

      await monitor.runIteration();

      expect(atomiqGateway.claimForwardSwap).not.toHaveBeenCalled();
    });

    it('does NOT claim reverse swaps even when claimable', async () => {
      const reverseSwap = Swap.createStarknetToLightning({
        id: SwapId.of('s-reverse'),
        amount: Amount.ofSatoshi(50_000n),
        sourceAddress: DESTINATION,
        invoice: INVOICE as unknown as LightningInvoice,
        depositAddress: '0xdeposit',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        description: 'Sent',
        accountId: 'account-001',
      });
      vi.mocked(swapCoordinator.getActiveSwaps).mockResolvedValue([reverseSwap]);
      vi.mocked(swapReader.fetchStatus).mockResolvedValue({
        swap: reverseSwap,
        status: 'claimable',
        progress: 50,
      });

      await monitor.runIteration();

      expect(atomiqGateway.claimForwardSwap).not.toHaveBeenCalled();
    });
  });

  describe('ensureRunning', () => {
    it('starts the monitor if not running', async () => {
      vi.mocked(swapCoordinator.getActiveSwaps).mockResolvedValue([]);

      monitor.ensureRunning();
      await new Promise(resolve => setTimeout(resolve, 150));
      await monitor.stop();

      expect(swapCoordinator.getActiveSwaps).toHaveBeenCalled();
    });

    it('is a no-op if already running', async () => {
      vi.mocked(swapCoordinator.getActiveSwaps).mockResolvedValue([]);

      monitor.start();
      expect(() => { monitor.ensureRunning(); }).not.toThrow();

      await new Promise(resolve => setTimeout(resolve, 150));
      await monitor.stop();
    });
  });
});
