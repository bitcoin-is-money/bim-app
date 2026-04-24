import {StarknetAddress} from '@bim/domain/account';
import type {AtomiqGateway, SwapRepository, TransactionRepository} from '@bim/domain/ports';
import {Amount} from '@bim/domain/shared';
import {
  BitcoinAddress,
  Swap,
  SwapId,
  SwapOwnershipError,
  SwapReader,
} from '@bim/domain/swap';
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

function createPendingStarknetToBitcoinSwap(id = 'swap-rev-001'): Swap {
  return Swap.createStarknetToBitcoin({
    id: SwapId.of(id),
    amount: Amount.ofSatoshi(50_000n),
    sourceAddress: DESTINATION_ADDRESS,
    destinationAddress: BitcoinAddress.of('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', 'mainnet'),
    depositAddress: '0xdeposit',
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    description: 'Sent',
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
    checkHealth: vi.fn(),
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
    claimForwardSwap: vi.fn(),
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
    countAll: vi.fn(),
    countCreatedSince: vi.fn(),
    existsByHash: vi.fn(),
    saveDescription: vi.fn(),
  };
}

describe('SwapReader', () => {
  let service: SwapReader;
  let repository: SwapRepository;
  let gateway: AtomiqGateway;
  let transactionRepository: TransactionRepository;

  beforeEach(() => {
    repository = createMockRepository();
    gateway = createMockGateway();
    transactionRepository = createMockTransactionRepository();
    service = new SwapReader({swapRepository: repository, atomiqGateway: gateway, transactionRepository, logger});
  });

  // =========================================================================
  // fetchLimits
  // =========================================================================

  describe('fetchLimits', () => {
    const limits = {minSats: 1_000n, maxSats: 1_000_000n, baseFeeSats: 100n, feePercent: 1};

    it('dispatches lightning_to_starknet to the right gateway method', async () => {
      vi.mocked(gateway.getLightningToStarknetLimits).mockResolvedValue(limits);
      const result = await service.fetchLimits({direction: 'lightning_to_starknet'});
      expect(result.limits).toBe(limits);
      expect(gateway.getLightningToStarknetLimits).toHaveBeenCalledOnce();
    });

    it('dispatches bitcoin_to_starknet to the right gateway method', async () => {
      vi.mocked(gateway.getBitcoinToStarknetLimits).mockResolvedValue(limits);
      const result = await service.fetchLimits({direction: 'bitcoin_to_starknet'});
      expect(result.limits).toBe(limits);
      expect(gateway.getBitcoinToStarknetLimits).toHaveBeenCalledOnce();
    });

    it('dispatches starknet_to_lightning to the right gateway method', async () => {
      vi.mocked(gateway.getStarknetToLightningLimits).mockResolvedValue(limits);
      const result = await service.fetchLimits({direction: 'starknet_to_lightning'});
      expect(result.limits).toBe(limits);
      expect(gateway.getStarknetToLightningLimits).toHaveBeenCalledOnce();
    });

    it('dispatches starknet_to_bitcoin to the right gateway method', async () => {
      vi.mocked(gateway.getStarknetToBitcoinLimits).mockResolvedValue(limits);
      const result = await service.fetchLimits({direction: 'starknet_to_bitcoin'});
      expect(result.limits).toBe(limits);
      expect(gateway.getStarknetToBitcoinLimits).toHaveBeenCalledOnce();
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
        isClaimable: false,
        isCompleted: false,
        isFailed: false,
        isExpired: true,
        isRefunded: false,
        isRefundable: false,
      });

      const result = await service.fetchStatus({swapId: swap.data.id, accountId: ACCOUNT_ID});

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
        isClaimable: false,
        isCompleted: false,
        isFailed: false,
        isExpired: true,
        isRefunded: false,
        isRefundable: false,
      });

      const result = await service.fetchStatus({swapId: swap.data.id, accountId: ACCOUNT_ID});

      expect(result.status).toBe('expired');
      expect(repository.save).toHaveBeenCalled();
    });

    it('marks Lightning swap as expired normally even with isPaid+isExpired', async () => {
      const swap = createPendingLightningSwap();
      vi.mocked(repository.findById).mockResolvedValue(swap);
      vi.mocked(gateway.getSwapStatus).mockResolvedValue({
        state: -1,
        isPaid: false,
        isClaimable: false,
        isCompleted: false,
        isFailed: false,
        isExpired: true,
        isRefunded: false,
        isRefundable: false,
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
        isClaimable: false,
        isCompleted: false,
        isFailed: false,
        isExpired: false,
        isRefunded: false,
        isRefundable: false,
      });

      const result = await service.fetchStatus({swapId: swap.data.id, accountId: ACCOUNT_ID});

      expect(result.status).toBe('paid');
      expect(result.progress).toBe(33);
    });

    it('reaches completed directly when Atomiq reports isCompleted', async () => {
      const swap = createPendingLightningSwap();
      vi.mocked(repository.findById).mockResolvedValue(swap);
      vi.mocked(gateway.getSwapStatus).mockResolvedValue({
        state: 3,
        isPaid: true,
        isClaimable: true,
        isCompleted: true,
        isFailed: false,
        isExpired: false,
        isRefunded: false,
        isRefundable: false,
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
        isClaimable: false,
        isCompleted: false,
        isFailed: true,
        isExpired: false,
        isRefunded: false,
        isRefundable: false,
        error: 'Network error',
      });

      const result = await service.fetchStatus({swapId: swap.data.id, accountId: ACCOUNT_ID});

      expect(result.status).toBe('failed');
    });

    it('does not sync terminal swaps with Atomiq', async () => {
      const swap = createPendingLightningSwap();
      swap.markAsPaid();
      swap.markAsCompleted('0x123');
      vi.mocked(repository.findById).mockResolvedValue(swap);

      await service.fetchStatus({swapId: swap.data.id, accountId: ACCOUNT_ID});

      expect(gateway.getSwapStatus).not.toHaveBeenCalled();
    });

    it('detects claimable status when Atomiq reports isClaimable', async () => {
      const swap = createPendingLightningSwap();
      vi.mocked(repository.findById).mockResolvedValue(swap);
      vi.mocked(gateway.getSwapStatus).mockResolvedValue({
        state: 2,
        isPaid: true,
        isClaimable: true,
        isCompleted: false,
        isFailed: false,
        isExpired: false,
        isRefunded: false,
        isRefundable: false,
      });

      const result = await service.fetchStatus({swapId: swap.data.id, accountId: ACCOUNT_ID});

      expect(result.status).toBe('claimable');
      expect(result.progress).toBe(50);
    });

    it('isClaimable takes priority over isPaid in syncWithAtomiq', async () => {
      const swap = createPendingLightningSwap();
      vi.mocked(repository.findById).mockResolvedValue(swap);
      vi.mocked(gateway.getSwapStatus).mockResolvedValue({
        state: 2,
        isPaid: true,
        isClaimable: true,
        isCompleted: false,
        isFailed: false,
        isExpired: false,
        isRefunded: false,
        isRefundable: false,
      });

      const result = await service.fetchStatus({swapId: swap.data.id, accountId: ACCOUNT_ID});

      expect(result.status).toBe('claimable');
    });

    it('does not mark swap as expired or lost on transient gateway error', async () => {
      const swap = createPendingLightningSwap();
      vi.mocked(repository.findById).mockResolvedValue(swap);
      vi.mocked(gateway.getSwapStatus).mockRejectedValue(new Error('ETIMEDOUT'));

      const result = await service.fetchStatus({swapId: swap.data.id, accountId: ACCOUNT_ID});

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

    it('detects refundable status for reverse swap when Atomiq reports isRefundable', async () => {
      const swap = createPendingStarknetToBitcoinSwap();
      vi.mocked(repository.findById).mockResolvedValue(swap);
      vi.mocked(gateway.getSwapStatus).mockResolvedValue({
        state: 4,
        isPaid: false,
        isClaimable: false,
        isCompleted: false,
        isFailed: false,
        isExpired: false,
        isRefunded: false,
        isRefundable: true,
      });

      const result = await service.fetchStatus({swapId: swap.data.id, accountId: ACCOUNT_ID});

      expect(result.status).toBe('refundable');
      expect(result.progress).toBe(0);
      expect(repository.save).toHaveBeenCalled();
    });

    it('throws SwapOwnershipError when swap belongs to another account', async () => {
      const swap = createPendingLightningSwap();
      vi.mocked(repository.findById).mockResolvedValue(swap);
      const otherAccountId = '660e8400-e29b-41d4-a716-446655440099';

      const error = await service.fetchStatus({swapId: swap.data.id, accountId: otherAccountId})
        .catch((err: unknown) => err);

      expect(error).toBeInstanceOf(SwapOwnershipError);
    });

    it('does not mark refundable swap as completed', async () => {
      const swap = createPendingStarknetToBitcoinSwap();
      vi.mocked(repository.findById).mockResolvedValue(swap);
      vi.mocked(gateway.getSwapStatus).mockResolvedValue({
        state: 4,
        isPaid: false,
        isClaimable: false,
        isCompleted: false,
        isFailed: false,
        isExpired: false,
        isRefunded: false,
        isRefundable: true,
      });

      const result = await service.fetchStatus({swapId: swap.data.id, accountId: ACCOUNT_ID});

      expect(result.status).not.toBe('completed');
      expect(result.status).toBe('refundable');
    });
  });
});
