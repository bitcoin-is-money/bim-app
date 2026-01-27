import {AccountId, StarknetAddress} from '@bim/domain/account';
import type {TransactionRepository, WatchedAddressRepository} from '@bim/domain/ports';
import {
  getFetchTransactionsForAddressService,
  getFetchTransactionsService,
  Transaction,
  TransactionHash,
  TransactionId,
  WatchedAddress,
  WatchedAddressId,
  WatchedAddressNotFoundError
} from '@bim/domain/user';
import {beforeEach, describe, expect, it, vi} from 'vitest';

describe('Transaction Services', () => {
  const accountId = AccountId.of('550e8400-e29b-41d4-a716-446655440000');
  const addressId1 = WatchedAddressId.of('660e8400-e29b-41d4-a716-446655440001');
  const addressId2 = WatchedAddressId.of('770e8400-e29b-41d4-a716-446655440002');
  const starknetAddress = StarknetAddress.of('0x123');
  const tokenAddress = StarknetAddress.of('0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7');

  let mockTransactionRepo: TransactionRepository;
  let mockAddressRepo: WatchedAddressRepository;

  const createMockTransaction = (
    id: string,
    watchedAddressId: WatchedAddressId,
    timestamp: Date,
  ): Transaction => {
    return Transaction.create({
      id: TransactionId.of(id),
      watchedAddressId,
      transactionHash: TransactionHash.of(`0x${id.slice(0, 8)}`),
      blockNumber: 12345n,
      transactionType: 'receipt',
      amount: '1000000000000000000',
      tokenAddress,
      fromAddress: StarknetAddress.of('0x111'),
      toAddress: starknetAddress,
      timestamp,
    });
  };

  beforeEach(() => {
    mockTransactionRepo = {
      save: vi.fn(),
      saveMany: vi.fn(),
      findById: vi.fn(),
      findByHash: vi.fn(),
      findByWatchedAddressId: vi.fn(),
      countByWatchedAddressId: vi.fn(),
      existsByHash: vi.fn(),
    };
    mockAddressRepo = {
      save: vi.fn(),
      findById: vi.fn(),
      findByAccountId: vi.fn(),
      findByStarknetAddress: vi.fn(),
      findAllActive: vi.fn(),
    };
  });

  describe('getFetchTransactionsService', () => {
    it('returns transactions for all account addresses', async () => {
      const address1 = WatchedAddress.create({
        id: addressId1,
        accountId,
        starknetAddress,
        addressType: 'main',
      });
      const address2 = WatchedAddress.create({
        id: addressId2,
        accountId,
        starknetAddress: StarknetAddress.of('0x456'),
        addressType: 'imported',
      });

      const tx1 = createMockTransaction(
        '550e8400-e29b-41d4-a716-446655440010',
        addressId1,
        new Date('2024-01-15'),
      );
      const tx2 = createMockTransaction(
        '550e8400-e29b-41d4-a716-446655440011',
        addressId2,
        new Date('2024-01-16'),
      );

      vi.mocked(mockAddressRepo.findByAccountId).mockResolvedValue([address1, address2]);
      vi.mocked(mockTransactionRepo.findByWatchedAddressId)
        .mockResolvedValueOnce([tx1])
        .mockResolvedValueOnce([tx2]);
      vi.mocked(mockTransactionRepo.countByWatchedAddressId)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1);

      const useCase = getFetchTransactionsService({
        transactionRepository: mockTransactionRepo,
        watchedAddressRepository: mockAddressRepo,
      });
      const result = await useCase({accountId: accountId});

      expect(result.transactions).toHaveLength(2);
      expect(result.total).toBe(2);
      // Should be sorted by timestamp descending (newest first)
      expect(result.transactions[0].timestamp.getTime()).toBeGreaterThan(
        result.transactions[1].timestamp.getTime(),
      );
    });

    it('returns empty result if no addresses', async () => {
      vi.mocked(mockAddressRepo.findByAccountId).mockResolvedValue([]);

      const useCase = getFetchTransactionsService({
        transactionRepository: mockTransactionRepo,
        watchedAddressRepository: mockAddressRepo,
      });
      const result = await useCase({accountId: accountId});

      expect(result.transactions).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('uses default pagination values', async () => {
      const address = WatchedAddress.create({
        id: addressId1,
        accountId,
        starknetAddress,
        addressType: 'main',
      });

      vi.mocked(mockAddressRepo.findByAccountId).mockResolvedValue([address]);
      vi.mocked(mockTransactionRepo.findByWatchedAddressId).mockResolvedValue([]);
      vi.mocked(mockTransactionRepo.countByWatchedAddressId).mockResolvedValue(0);

      const useCase = getFetchTransactionsService({
        transactionRepository: mockTransactionRepo,
        watchedAddressRepository: mockAddressRepo,
      });
      await useCase({accountId: accountId});

      expect(mockTransactionRepo.findByWatchedAddressId).toHaveBeenCalledWith(
        addressId1,
        {limit: 10, offset: 0},
      );
    });
  });

  describe('getFetchTransactionsForAddressService', () => {
    it('returns transactions for specific address', async () => {
      const address = WatchedAddress.create({
        id: addressId1,
        accountId,
        starknetAddress,
        addressType: 'main',
      });
      const tx = createMockTransaction(
        '550e8400-e29b-41d4-a716-446655440010',
        addressId1,
        new Date('2024-01-15'),
      );

      vi.mocked(mockAddressRepo.findById).mockResolvedValue(address);
      vi.mocked(mockTransactionRepo.findByWatchedAddressId).mockResolvedValue([tx]);
      vi.mocked(mockTransactionRepo.countByWatchedAddressId).mockResolvedValue(1);

      const useCase = getFetchTransactionsForAddressService({
        transactionRepository: mockTransactionRepo,
        watchedAddressRepository: mockAddressRepo,
      });
      const result = await useCase({addressId: addressId1});

      expect(result.transactions).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('throws if address not found', async () => {
      vi.mocked(mockAddressRepo.findById).mockResolvedValue(undefined);

      const useCase = getFetchTransactionsForAddressService({
        transactionRepository: mockTransactionRepo,
        watchedAddressRepository: mockAddressRepo,
      });

      await expect(
        useCase({addressId: addressId1}),
      ).rejects.toThrow(WatchedAddressNotFoundError);
    });

    it('uses custom pagination values', async () => {
      const address = WatchedAddress.create({
        id: addressId1,
        accountId,
        starknetAddress,
        addressType: 'main',
      });

      vi.mocked(mockAddressRepo.findById).mockResolvedValue(address);
      vi.mocked(mockTransactionRepo.findByWatchedAddressId).mockResolvedValue([]);
      vi.mocked(mockTransactionRepo.countByWatchedAddressId).mockResolvedValue(0);

      const useCase = getFetchTransactionsForAddressService({
        transactionRepository: mockTransactionRepo,
        watchedAddressRepository: mockAddressRepo,
      });
      await useCase({addressId: addressId1, limit: 10, offset: 20});

      expect(mockTransactionRepo.findByWatchedAddressId).toHaveBeenCalledWith(
        addressId1,
        {limit: 10, offset: 20},
      );
    });
  });
});
