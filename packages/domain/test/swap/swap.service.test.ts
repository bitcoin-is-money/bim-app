import {StarknetAddress} from '@bim/domain/account';
import type {AtomiqGateway, SwapRepository, TransactionRepository} from '@bim/domain/ports';
import {Amount} from '@bim/domain/shared';
import {Swap, SwapCreationError, SwapId, SwapNotFoundError, SwapService} from '@bim/domain/swap';
import {createLogger} from '@bim/lib/logger';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const LOG_LEVEL = 'silent';
const logger = createLogger(LOG_LEVEL);

const DESTINATION_ADDRESS = StarknetAddress.of('0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
const VALID_INVOICE = 'lntb1000n1pjtest0pp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypq';
const ACCOUNT_ID = '550e8400-e29b-41d4-a716-446655440000';

function createPendingLightningSwap(id = 'swap-001'): Swap {
  return Swap.createLightningToStarknet({
    id: SwapId.of(id),
    amount: Amount.ofSatoshi(50_000n),
    destinationAddress: DESTINATION_ADDRESS,
    invoice: VALID_INVOICE,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    description: 'Received',
    accountId: ACCOUNT_ID,
  });
}

function createPendingBitcoinSwap(id = 'swap-btc-001'): Swap {
  return Swap.createBitcoinToStarknet({
    id: SwapId.of(id),
    amount: Amount.ofSatoshi(500_000n),
    destinationAddress: DESTINATION_ADDRESS,
    depositAddress: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
    expiresAt: new Date(Date.now() + 3 * 60 * 60 * 1000),
    description: 'Received',
    accountId: ACCOUNT_ID,
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
    service = new SwapService({swapRepository: repository, atomiqGateway: gateway, transactionRepository, bitcoinNetwork: 'mainnet', logger: logger});
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
        isRefunded: false,
      });

      const result = await service.fetchStatus({swapId: swap.data.id, accountId: ACCOUNT_ID});

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
        isRefunded: false,
      });

      const result = await service.fetchStatus({swapId: swap.data.id, accountId: ACCOUNT_ID});

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
        isRefunded: false,
      });

      const result = await service.fetchStatus({swapId: swap.data.id, accountId: ACCOUNT_ID});

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
        isRefunded: false,
      });

      const result = await service.fetchStatus({swapId: swap.data.id, accountId: ACCOUNT_ID});

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
        isRefunded: false,
        txHash: '0xabc',
      });

      const result = await service.fetchStatus({swapId: swap.data.id, accountId: ACCOUNT_ID});
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
        isRefunded: false,
        error: 'Network error',
      });

      const result = await service.fetchStatus({swapId: swap.data.id, accountId: ACCOUNT_ID});

      expect(result.status).toBe('failed');
    });

    it('does not sync terminal swaps with Atomiq', async () => {
      const swap = createPendingLightningSwap();
      swap.markAsPaid();
      swap.markAsConfirming('0x123');
      swap.markAsCompleted('0x123');
      vi.mocked(repository.findById).mockResolvedValue(swap);

      await service.fetchStatus({swapId: swap.data.id, accountId: ACCOUNT_ID});

      expect(gateway.getSwapStatus).not.toHaveBeenCalled();
    });

    // A transient gateway error (network timeout, 500, etc.) must NOT cause
    // the swap to be marked as expired or lost — doing so would permanently
    // kill an active swap that still has funds in escrow.
    it('does not mark swap as expired or lost on transient gateway error', async () => {
      const swap = createPendingLightningSwap();
      vi.mocked(repository.findById).mockResolvedValue(swap);
      vi.mocked(gateway.getSwapStatus).mockRejectedValue(new Error('ETIMEDOUT'));

      const result = await service.fetchStatus({swapId: swap.data.id, accountId: ACCOUNT_ID});

      // The swap must remain pending — not lost or expired
      expect(result.status).toBe('pending');
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('ignores sync errors and returns local state', async () => {
      const swap = createPendingLightningSwap();
      vi.mocked(repository.findById).mockResolvedValue(swap);
      vi.mocked(gateway.getSwapStatus).mockRejectedValue(new Error('Network error'));

      const result = await service.fetchStatus({swapId: swap.data.id, accountId: ACCOUNT_ID});

      expect(result.status).toBe('pending');
    });
  });

  // =========================================================================
  // saveBitcoinCommit
  // =========================================================================

  describe('saveBitcoinCommit', () => {
    it('creates a committed swap and saves it to the repository', async () => {
      const result = await service.saveBitcoinCommit({
        swapId: 'swap-btc-commit-001',
        destinationAddress: DESTINATION_ADDRESS,
        amount: Amount.ofSatoshi(500_000n),
        description: 'Received',
        accountId: ACCOUNT_ID,
        commitTxHash: '0xcommit123',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      expect(result.getStatus()).toBe('committed');
      expect(result.getTxHash()).toBe('0xcommit123');
      expect(result.data.direction).toBe('bitcoin_to_starknet');
      expect(result.data.depositAddress).toBeUndefined();
      expect(result.isTerminal()).toBe(false);
      expect(result.getProgress()).toBe(10);
      expect(repository.save).toHaveBeenCalledWith(result);
    });
  });

  // =========================================================================
  // completeBitcoinToStarknet
  // =========================================================================

  describe('completeBitcoinToStarknet', () => {
    it('loads existing swap, sets deposit address, and marks as paid', async () => {
      const committedSwap = Swap.createBitcoinToStarknetCommitted({
        id: SwapId.of('swap-btc-complete-001'),
        amount: Amount.ofSatoshi(500_000n),
        destinationAddress: DESTINATION_ADDRESS,
        commitTxHash: '0xcommit456',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        description: 'Received',
        accountId: ACCOUNT_ID,
      });
      vi.mocked(repository.findById).mockResolvedValue(committedSwap);
      vi.mocked(gateway.completeBitcoinSwapCommit).mockResolvedValue({
        depositAddress: 'bc1qdeposit123',
        bip21Uri: 'bitcoin:bc1qdeposit123?amount=0.005',
      });

      const result = await service.completeBitcoinToStarknet({
        swapId: 'swap-btc-complete-001',
      });

      expect(result.depositAddress).toBe('bc1qdeposit123');
      expect(result.bip21Uri).toBe('bitcoin:bc1qdeposit123?amount=0.005');
      expect(result.swap.data.depositAddress).toBe('bc1qdeposit123');
      expect(result.swap.getStatus()).toBe('paid');
      expect(repository.save).toHaveBeenCalledWith(committedSwap);
    });

    it('throws SwapNotFoundError if swap does not exist', async () => {
      vi.mocked(repository.findById).mockResolvedValue(undefined);

      await expect(
        service.completeBitcoinToStarknet({swapId: 'nonexistent'}),
      ).rejects.toThrow(SwapNotFoundError);
    });

    it('throws SwapCreationError if deposit address is missing', async () => {
      const committedSwap = Swap.createBitcoinToStarknetCommitted({
        id: SwapId.of('swap-btc-noaddr'),
        amount: Amount.ofSatoshi(500_000n),
        destinationAddress: DESTINATION_ADDRESS,
        commitTxHash: '0xcommit789',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        description: 'Received',
        accountId: ACCOUNT_ID,
      });
      vi.mocked(repository.findById).mockResolvedValue(committedSwap);
      vi.mocked(gateway.completeBitcoinSwapCommit).mockResolvedValue({
        depositAddress: '',
        bip21Uri: '',
      });

      await expect(
        service.completeBitcoinToStarknet({swapId: 'swap-btc-noaddr'}),
      ).rejects.toThrow(SwapCreationError);
    });
  });
});
