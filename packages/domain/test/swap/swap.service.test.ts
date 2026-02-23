import {StarknetAddress} from '@bim/domain/account';
import type {AtomiqGateway, SwapRepository, TransactionRepository} from '@bim/domain/ports';
import {Amount} from '@bim/domain/shared';
import {Swap, SwapId, SwapService} from '@bim/domain/swap';
import {createLogger} from '@bim/lib/logger';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const LOG_LEVEL = 'silent';
const logger = createLogger(LOG_LEVEL);

const DESTINATION_ADDRESS = StarknetAddress.of('0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
const VALID_INVOICE = 'lntb1000n1pjtest0pp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypq';

function createPendingLightningSwap(id = 'swap-001'): Swap {
  return Swap.createLightningToStarknet({
    id: SwapId.of(id),
    amount: Amount.ofSatoshi(50_000n),
    destinationAddress: DESTINATION_ADDRESS,
    invoice: VALID_INVOICE,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
  });
}

function createPendingBitcoinSwap(id = 'swap-btc-001'): Swap {
  return Swap.createBitcoinToStarknet({
    id: SwapId.of(id),
    amount: Amount.ofSatoshi(500_000n),
    destinationAddress: DESTINATION_ADDRESS,
    depositAddress: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
    expiresAt: new Date(Date.now() + 3 * 60 * 60 * 1000),
  });
}

function createMockRepository(): SwapRepository {
  return {
    save: vi.fn(),
    findById: vi.fn(),
    findByStatus: vi.fn(),
    findByDestinationAddress: vi.fn(),
    findActive: vi.fn(),
    findByDirection: vi.fn(),
    delete: vi.fn(),
    deleteExpiredBefore: vi.fn(),
  };
}

function createMockGateway(): AtomiqGateway {
  return {
    createLightningToStarknetSwap: vi.fn(),
    createBitcoinToStarknetSwap: vi.fn(),
    prepareBitcoinToStarknetSwap: vi.fn(),
    completeBitcoinSwapCommit: vi.fn(),
    createStarknetToLightningSwap: vi.fn(),
    createStarknetToBitcoinSwap: vi.fn(),
    getLightningToStarknetLimits: vi.fn(),
    getBitcoinToStarknetLimits: vi.fn(),
    getStarknetToLightningLimits: vi.fn(),
    getStarknetToBitcoinLimits: vi.fn(),
    getSwapStatus: vi.fn(),
    isSwapPaid: vi.fn(),
    claimSwap: vi.fn(),
    waitForClaimConfirmation: vi.fn(),
    getUnsignedClaimTransactions: vi.fn(),
  };
}

function createMockTransactionRepository(): TransactionRepository {
  return {
    save: vi.fn(),
    saveMany: vi.fn(),
    findById: vi.fn(),
    findByHash: vi.fn(),
    findByAccountId: vi.fn(),
    countByAccountId: vi.fn(),
    existsByHash: vi.fn(),
    saveDescription: vi.fn(),
    deleteDescription: vi.fn(),
  };
}

describe('SwapService', () => {
  let service: SwapService;
  let repository: SwapRepository;
  let gateway: AtomiqGateway;
  let transactionRepository: TransactionRepository;

  beforeEach(() => {
    repository = createMockRepository();
    gateway = createMockGateway();
    transactionRepository = createMockTransactionRepository();
    service = new SwapService({swapRepository: repository, atomiqGateway: gateway, transactionRepository, logger: logger});
  });

  // =========================================================================
  // getActiveSwaps
  // =========================================================================

  describe('getActiveSwaps', () => {
    it('delegates to repository.findActive()', async () => {
      const swaps = [createPendingLightningSwap('s1'), createPendingLightningSwap('s2')];
      vi.mocked(repository.findActive).mockResolvedValue(swaps);

      const result = await service.getActiveSwaps();

      expect(repository.findActive).toHaveBeenCalledOnce();
      expect(result).toHaveLength(2);
    });

    it('returns empty array when no active swaps', async () => {
      vi.mocked(repository.findActive).mockResolvedValue([]);

      const result = await service.getActiveSwaps();

      expect(result).toHaveLength(0);
    });
  });

  // =========================================================================
  // fetchStatus — Bitcoin deposit edge case
  // =========================================================================

  describe('fetchStatus — Bitcoin deposit edge case', () => {
    it('marks Bitcoin swap as paid when Atomiq reports expired but deposit is confirmed', async () => {
      const swap = createPendingBitcoinSwap();
      vi.mocked(repository.findById).mockResolvedValue(swap);
      vi.mocked(gateway.getSwapStatus).mockResolvedValue({
        state: 1,
        isPaid: true,
        isCompleted: false,
        isFailed: false,
        isExpired: true, // Atomiq says expired...
      });

      const result = await service.fetchStatus({swapId: swap.id});

      // ...but deposit is confirmed, so it should be paid, not expired
      expect(result.status).toBe('paid');
      expect(result.progress).toBe(33);
      expect(repository.save).toHaveBeenCalled();
    });

    it('marks Bitcoin swap as expired when Atomiq reports expired with no deposit', async () => {
      const swap = createPendingBitcoinSwap();
      vi.mocked(repository.findById).mockResolvedValue(swap);
      vi.mocked(gateway.getSwapStatus).mockResolvedValue({
        state: -1,
        isPaid: false,
        isCompleted: false,
        isFailed: false,
        isExpired: true,
      });

      const result = await service.fetchStatus({swapId: swap.id});

      expect(result.status).toBe('expired');
      expect(repository.save).toHaveBeenCalled();
    });

    it('marks Lightning swap as expired normally even with isPaid+isExpired', async () => {
      // Lightning swaps don't have the deposit edge case
      const swap = createPendingLightningSwap();
      vi.mocked(repository.findById).mockResolvedValue(swap);
      vi.mocked(gateway.getSwapStatus).mockResolvedValue({
        state: -1,
        isPaid: false,
        isCompleted: false,
        isFailed: false,
        isExpired: true,
      });

      const result = await service.fetchStatus({swapId: swap.id});

      expect(result.status).toBe('expired');
    });
  });

  // =========================================================================
  // fetchStatus — normal transitions
  // =========================================================================

  describe('fetchStatus — normal transitions', () => {
    it('detects paid status from Atomiq', async () => {
      const swap = createPendingLightningSwap();
      vi.mocked(repository.findById).mockResolvedValue(swap);
      vi.mocked(gateway.getSwapStatus).mockResolvedValue({
        state: 1,
        isPaid: true,
        isCompleted: false,
        isFailed: false,
        isExpired: false,
      });

      const result = await service.fetchStatus({swapId: swap.id});

      expect(result.status).toBe('paid');
      expect(result.progress).toBe(33);
    });

    it('reaches completed directly when Atomiq reports isCompleted', async () => {
      // isCompleted has highest priority — no intermediate steps needed
      const swap = createPendingLightningSwap();
      vi.mocked(repository.findById).mockResolvedValue(swap);
      vi.mocked(gateway.getSwapStatus).mockResolvedValue({
        state: 3,
        isPaid: true,
        isCompleted: true,
        isFailed: false,
        isExpired: false,
        txHash: '0xabc',
      });

      const result = await service.fetchStatus({swapId: swap.id});
      expect(result.status).toBe('completed');
      expect(result.progress).toBe(100);
      expect(result.txHash).toBe('0xabc');
    });

    it('detects failed status from Atomiq', async () => {
      const swap = createPendingLightningSwap();
      vi.mocked(repository.findById).mockResolvedValue(swap);
      vi.mocked(gateway.getSwapStatus).mockResolvedValue({
        state: -4,
        isPaid: false,
        isCompleted: false,
        isFailed: true,
        isExpired: false,
        error: 'Network error',
      });

      const result = await service.fetchStatus({swapId: swap.id});

      expect(result.status).toBe('failed');
    });

    it('does not sync terminal swaps with Atomiq', async () => {
      const swap = createPendingLightningSwap();
      swap.markAsPaid();
      swap.markAsConfirming('0x123');
      swap.markAsCompleted('0x123');
      vi.mocked(repository.findById).mockResolvedValue(swap);

      await service.fetchStatus({swapId: swap.id});

      expect(gateway.getSwapStatus).not.toHaveBeenCalled();
    });

    it('ignores sync errors and returns local state', async () => {
      const swap = createPendingLightningSwap();
      vi.mocked(repository.findById).mockResolvedValue(swap);
      vi.mocked(gateway.getSwapStatus).mockRejectedValue(new Error('Network error'));

      const result = await service.fetchStatus({swapId: swap.id});

      expect(result.status).toBe('pending');
    });
  });
});
