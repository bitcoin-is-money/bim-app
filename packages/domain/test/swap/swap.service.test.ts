import {StarknetAddress} from '@bim/domain/account';
import type {AtomiqGateway, SwapRepository, TransactionRepository} from '@bim/domain/ports';
import {Amount} from '@bim/domain/shared';
import {BitcoinAddress, Swap, SwapAmountError, SwapCreationError, SwapId, SwapNotFoundError, SwapOwnershipError, SwapService} from '@bim/domain/swap';
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
        isClaimable: false,
        isCompleted: false,
        isFailed: false,
        isExpired: true, // Atomiq says expired...
        isRefunded: false,
        isRefundable: false,
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
      // Lightning swaps don't have the deposit edge case
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
      // isCompleted has highest priority — no intermediate steps needed
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

      // isClaimable should win over isPaid
      expect(result.status).toBe('claimable');
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
      if (result.data.direction !== 'bitcoin_to_starknet') throw new Error('expected bitcoin_to_starknet');
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
      if (result.swap.data.direction !== 'bitcoin_to_starknet') throw new Error('expected bitcoin_to_starknet');
      expect(result.swap.data.depositAddress).toBe('bc1qdeposit123');
      expect(result.swap.getStatus()).toBe('paid');
      expect(repository.save).toHaveBeenCalledWith(committedSwap);
    });

    it('throws SwapNotFoundError with swapId when swap does not exist', async () => {
      vi.mocked(repository.findById).mockResolvedValue(undefined);

      const error = await service.completeBitcoinToStarknet({swapId: 'nonexistent'})
        .catch((err: unknown) => err);

      expect(error).toBeInstanceOf(SwapNotFoundError);
      expect((error as SwapNotFoundError).args).toEqual({swapId: 'nonexistent'});
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

  // =========================================================================
  // recordClaimAttempt
  // =========================================================================

  describe('recordClaimAttempt', () => {
    it('records the claim tx hash without changing the swap status', async () => {
      const swap = createPendingLightningSwap();
      swap.markAsClaimable();
      vi.mocked(repository.findById).mockResolvedValue(swap);

      await service.recordClaimAttempt(swap.data.id, '0xclaim_tx_hash');

      expect(swap.getStatus()).toBe('claimable');
      expect(swap.getTxHash()).toBe('0xclaim_tx_hash');
      expect(swap.hasRecentClaimAttempt(60_000)).toBe(true);
      expect(repository.save).toHaveBeenCalledWith(swap);
    });

    it('throws SwapNotFoundError if swap does not exist', async () => {
      vi.mocked(repository.findById).mockResolvedValue(undefined);

      await expect(
        service.recordClaimAttempt('nonexistent', '0xhash'),
      ).rejects.toThrow(SwapNotFoundError);
    });
  });

  // =========================================================================
  // createLightningToStarknet (forward)
  // =========================================================================

  describe('createLightningToStarknet', () => {
    const SWAP_ID = '660e8400-e29b-41d4-a716-446655440099';
    const limits = {minSats: 1_000n, maxSats: 1_000_000n, baseFeeSats: 100n, feePercent: 1};

    it('creates and persists a Lightning swap on happy path', async () => {
      vi.mocked(gateway.getLightningToStarknetLimits).mockResolvedValue(limits);
      vi.mocked(gateway.createLightningToStarknetSwap).mockResolvedValue({
        swapId: SWAP_ID,
        invoice: VALID_INVOICE,
        expiresAt: new Date(Date.now() + 30 * 60_000),
      });

      const result = await service.createLightningToStarknet({
        amount: Amount.ofSatoshi(50_000n),
        destinationAddress: DESTINATION_ADDRESS,
        description: 'test',
        accountId: ACCOUNT_ID,
      });

      expect(result.invoice).toBe(VALID_INVOICE);
      expect(repository.save).toHaveBeenCalledOnce();
    });

    it('throws SwapAmountError with correct limits when amount is below minimum', async () => {
      vi.mocked(gateway.getLightningToStarknetLimits).mockResolvedValue(limits);

      const error = await service.createLightningToStarknet({
        amount: Amount.ofSatoshi(500n),
        destinationAddress: DESTINATION_ADDRESS,
        description: 'test',
        accountId: ACCOUNT_ID,
      }).catch((err: unknown) => err);

      expect(error).toBeInstanceOf(SwapAmountError);
      expect((error as SwapAmountError).args).toEqual({amount: 500, min: 1000, max: 1_000_000, unit: 'sats'});
      expect(gateway.createLightningToStarknetSwap).not.toHaveBeenCalled();
    });

    it('throws SwapCreationError with reason when invoice is missing', async () => {
      vi.mocked(gateway.getLightningToStarknetLimits).mockResolvedValue(limits);
      vi.mocked(gateway.createLightningToStarknetSwap).mockResolvedValue({
        swapId: SWAP_ID,
        invoice: '',
        expiresAt: new Date(),
      });

      const error = await service.createLightningToStarknet({
        amount: Amount.ofSatoshi(50_000n),
        destinationAddress: DESTINATION_ADDRESS,
        description: 'test',
        accountId: ACCOUNT_ID,
      }).catch((err: unknown) => err);

      expect(error).toBeInstanceOf(SwapCreationError);
      expect((error as SwapCreationError).args).toHaveProperty('reason');
    });
  });

  // =========================================================================
  // prepareBitcoinToStarknet (forward)
  // =========================================================================

  describe('prepareBitcoinToStarknet', () => {
    const SWAP_ID = '660e8400-e29b-41d4-a716-446655440098';
    const limits = {minSats: 10_000n, maxSats: 10_000_000n, baseFeeSats: 100n, feePercent: 1};

    it('returns swapId + commit calls + expiry on happy path', async () => {
      const expiresAt = new Date(Date.now() + 60_000);
      vi.mocked(gateway.getBitcoinToStarknetLimits).mockResolvedValue(limits);
      vi.mocked(gateway.prepareBitcoinToStarknetSwap).mockResolvedValue({
        swapId: SWAP_ID,
        commitCalls: [{contractAddress: '0xescrow', entrypoint: 'commit', calldata: []}],
        expiresAt,
      });

      const result = await service.prepareBitcoinToStarknet({
        amount: Amount.ofSatoshi(500_000n),
        destinationAddress: DESTINATION_ADDRESS,
        description: 'test',
        accountId: ACCOUNT_ID,
      });

      expect(result.swapId).toBe(SWAP_ID);
      expect(result.commitCalls).toHaveLength(1);
      expect(result.expiresAt).toBe(expiresAt);
      expect(repository.save).not.toHaveBeenCalled(); // persisted later via saveBitcoinCommit
    });

    it('throws SwapAmountError with correct limits when amount is above maximum', async () => {
      vi.mocked(gateway.getBitcoinToStarknetLimits).mockResolvedValue(limits);

      const error = await service.prepareBitcoinToStarknet({
        amount: Amount.ofSatoshi(50_000_000n),
        destinationAddress: DESTINATION_ADDRESS,
        description: 'test',
        accountId: ACCOUNT_ID,
      }).catch((err: unknown) => err);

      expect(error).toBeInstanceOf(SwapAmountError);
      expect((error as SwapAmountError).args).toEqual({amount: 50_000_000, min: 10_000, max: 10_000_000, unit: 'sats'});
    });
  });

  // =========================================================================
  // createStarknetToLightning (reverse)
  // =========================================================================

  describe('createStarknetToLightning', () => {
    const SWAP_ID = '660e8400-e29b-41d4-a716-446655440097';
    const limits = {minSats: 1_000n, maxSats: 1_000_000n, baseFeeSats: 100n, feePercent: 1};

    it('creates and persists a reverse Lightning swap on happy path', async () => {
      vi.mocked(gateway.getStarknetToLightningLimits).mockResolvedValue(limits);
      vi.mocked(gateway.createStarknetToLightningSwap).mockResolvedValue({
        swapId: SWAP_ID,
        amountSats: 50_000n,
        commitCalls: [{contractAddress: '0xescrow', entrypoint: 'commit', calldata: []}],
        expiresAt: new Date(Date.now() + 30 * 60_000),
      });

      const result = await service.createStarknetToLightning({
        invoice: VALID_INVOICE,
        sourceAddress: DESTINATION_ADDRESS,
        description: 'test',
        accountId: ACCOUNT_ID,
      });

      expect(result.amount.getSat()).toBe(50_000n);
      expect(result.commitCalls).toHaveLength(1);
      expect(repository.save).toHaveBeenCalledOnce();
    });

    it('throws SwapCreationError if commit calls are empty', async () => {
      vi.mocked(gateway.getStarknetToLightningLimits).mockResolvedValue(limits);
      vi.mocked(gateway.createStarknetToLightningSwap).mockResolvedValue({
        swapId: SWAP_ID,
        amountSats: 50_000n,
        commitCalls: [],
        expiresAt: new Date(),
      });

      await expect(
        service.createStarknetToLightning({
          invoice: VALID_INVOICE,
          sourceAddress: DESTINATION_ADDRESS,
          description: 'test',
          accountId: ACCOUNT_ID,
        }),
      ).rejects.toThrow(SwapCreationError);
    });
  });

  // =========================================================================
  // createStarknetToBitcoin (reverse)
  // =========================================================================

  describe('createStarknetToBitcoin', () => {
    const SWAP_ID = '660e8400-e29b-41d4-a716-446655440096';
    const limits = {minSats: 10_000n, maxSats: 10_000_000n, baseFeeSats: 100n, feePercent: 1};

    it('creates and persists a reverse Bitcoin swap on happy path', async () => {
      vi.mocked(gateway.getStarknetToBitcoinLimits).mockResolvedValue(limits);
      vi.mocked(gateway.createStarknetToBitcoinSwap).mockResolvedValue({
        swapId: SWAP_ID,
        amountSats: 500_000n,
        commitCalls: [{contractAddress: '0xescrow', entrypoint: 'commit', calldata: []}],
        expiresAt: new Date(Date.now() + 30 * 60_000),
      });

      const result = await service.createStarknetToBitcoin({
        amount: Amount.ofSatoshi(500_000n),
        destinationAddress: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
        sourceAddress: DESTINATION_ADDRESS,
        description: 'test',
        accountId: ACCOUNT_ID,
      });

      expect(result.amount.getSat()).toBe(500_000n);
      expect(repository.save).toHaveBeenCalledOnce();
    });

    it('throws SwapCreationError if commit calls are empty', async () => {
      vi.mocked(gateway.getStarknetToBitcoinLimits).mockResolvedValue(limits);
      vi.mocked(gateway.createStarknetToBitcoinSwap).mockResolvedValue({
        swapId: SWAP_ID,
        amountSats: 500_000n,
        commitCalls: [],
        expiresAt: new Date(),
      });

      await expect(
        service.createStarknetToBitcoin({
          amount: Amount.ofSatoshi(500_000n),
          destinationAddress: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
          sourceAddress: DESTINATION_ADDRESS,
          description: 'test',
          accountId: ACCOUNT_ID,
        }),
      ).rejects.toThrow(SwapCreationError);
    });
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
});
