import {AccountId, StarknetAddress} from '@bim/domain/account';
import type {TransactionRepository, WatchedAddressRepository} from '@bim/domain/ports';
import {
  Transaction,
  TransactionId,
  TransactionService,
  WatchedAddress,
  WatchedAddressId,
  WatchedAddressNotFoundError,
} from '@bim/domain/user';
import {beforeEach, describe, expect, it, vi} from 'vitest';

describe('TransactionService', () => {
  const accountId = AccountId.of('550e8400-e29b-41d4-a716-446655440000');
  const addressId = WatchedAddressId.of('660e8400-e29b-41d4-a716-446655440001');
  const starknetAddress = StarknetAddress.of('0x123');

  let mockTransactionRepo: TransactionRepository;
  let mockWatchedAddressRepo: WatchedAddressRepository;
  let service: TransactionService;

  beforeEach(() => {
    mockTransactionRepo = {
      save: vi.fn(),
      findById: vi.fn(),
      findByWatchedAddressId: vi.fn(),
      countByWatchedAddressId: vi.fn(),
    };
    mockWatchedAddressRepo = {
      save: vi.fn(),
      findById: vi.fn(),
      findByAccountId: vi.fn(),
      findByStarknetAddress: vi.fn(),
      findAllActive: vi.fn(),
    };
    service = new TransactionService({
      transactionRepository: mockTransactionRepo,
      watchedAddressRepository: mockWatchedAddressRepo,
    });
  });

  describe('fetchForAccount', () => {
    it('returns transactions for all account addresses', async () => {
      const address = WatchedAddress.create({
        id: addressId,
        accountId,
        starknetAddress,
        addressType: 'main',
      });
      const tx = Transaction.create({
        id: TransactionId.of('770e8400-e29b-41d4-a716-446655440002'),
        watchedAddressId: addressId,
        transactionHash: '0xabc',
        blockNumber: BigInt(100),
        transactionType: 'receive',
        amount: '1000',
        tokenAddress: '0xtoken',
        fromAddress: '0xfrom',
        toAddress: starknetAddress,
        timestamp: new Date(),
      });

      vi.mocked(mockWatchedAddressRepo.findByAccountId).mockResolvedValue([address]);
      vi.mocked(mockTransactionRepo.findByWatchedAddressId).mockResolvedValue([tx]);
      vi.mocked(mockTransactionRepo.countByWatchedAddressId).mockResolvedValue(1);

      const result = await service.fetchForAccount({accountId: accountId});

      expect(result.transactions).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('returns empty array if no addresses', async () => {
      vi.mocked(mockWatchedAddressRepo.findByAccountId).mockResolvedValue([]);

      const result = await service.fetchForAccount({accountId: accountId});

      expect(result.transactions).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('respects limit and offset', async () => {
      const address = WatchedAddress.create({
        id: addressId,
        accountId,
        starknetAddress,
        addressType: 'main',
      });

      vi.mocked(mockWatchedAddressRepo.findByAccountId).mockResolvedValue([address]);
      vi.mocked(mockTransactionRepo.findByWatchedAddressId).mockResolvedValue([]);
      vi.mocked(mockTransactionRepo.countByWatchedAddressId).mockResolvedValue(0);

      await service.fetchForAccount({
        accountId: accountId,
        limit: 5,
        offset: 10,
      });

      expect(mockTransactionRepo.findByWatchedAddressId).toHaveBeenCalledWith(
        addressId,
        {limit: 5, offset: 10},
      );
    });
  });

  describe('fetchForAddress', () => {
    it('returns transactions for specific address', async () => {
      const address = WatchedAddress.create({
        id: addressId,
        accountId,
        starknetAddress,
        addressType: 'main',
      });
      const tx = Transaction.create({
        id: TransactionId.of('770e8400-e29b-41d4-a716-446655440002'),
        watchedAddressId: addressId,
        transactionHash: '0xabc',
        blockNumber: BigInt(100),
        transactionType: 'receive',
        amount: '1000',
        tokenAddress: '0xtoken',
        fromAddress: '0xfrom',
        toAddress: starknetAddress,
        timestamp: new Date(),
      });

      vi.mocked(mockWatchedAddressRepo.findById).mockResolvedValue(address);
      vi.mocked(mockTransactionRepo.findByWatchedAddressId).mockResolvedValue([tx]);
      vi.mocked(mockTransactionRepo.countByWatchedAddressId).mockResolvedValue(1);

      const result = await service.fetchForAddress({addressId: addressId});

      expect(result.transactions).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('throws if address not found', async () => {
      vi.mocked(mockWatchedAddressRepo.findById).mockResolvedValue(undefined);

      await expect(
        service.fetchForAddress({addressId: addressId}),
      ).rejects.toThrow(WatchedAddressNotFoundError);
    });
  });
});
