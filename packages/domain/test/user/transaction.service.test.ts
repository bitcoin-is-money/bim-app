import {AccountId, StarknetAddress} from '@bim/domain/account';
import type {TransactionRepository} from '@bim/domain/ports';
import {Transaction, TransactionHash, TransactionId, TransactionService,} from '@bim/domain/user';
import {beforeEach, describe, expect, it, vi} from 'vitest';

describe('TransactionService', () => {
  const accountId = AccountId.of('550e8400-e29b-41d4-a716-446655440000');

  let mockTransactionRepo: TransactionRepository;
  let service: TransactionService;

  beforeEach(() => {
    mockTransactionRepo = {
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
    service = new TransactionService({
      transactionRepository: mockTransactionRepo,
    });
  });

  describe('fetchForAccount', () => {
    it('returns transactions for account', async () => {
      const tx = Transaction.create({
        id: TransactionId.of('770e8400-e29b-41d4-a716-446655440002'),
        accountId,
        transactionHash: TransactionHash.of('0xabc'),
        blockNumber: 100n,
        transactionType: 'receipt',
        amount: '1000',
        tokenAddress: StarknetAddress.of('0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7'),
        fromAddress: StarknetAddress.of('0x0222222222222222222222222222222222222222222222222222222222222222'),
        toAddress: StarknetAddress.of('0x0111111111111111111111111111111111111111111111111111111111111111'),
        timestamp: new Date(),
        description: 'Received',
      });

      vi.mocked(mockTransactionRepo.findByAccountId).mockResolvedValue([tx]);
      vi.mocked(mockTransactionRepo.countByAccountId).mockResolvedValue(1);

      const result = await service.fetchForAccount({accountId: accountId});

      expect(result.transactions).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(mockTransactionRepo.findByAccountId).toHaveBeenCalledWith(
        accountId,
        {limit: 10, offset: 0},
      );
    });

    it('returns empty array when no transactions', async () => {
      vi.mocked(mockTransactionRepo.findByAccountId).mockResolvedValue([]);
      vi.mocked(mockTransactionRepo.countByAccountId).mockResolvedValue(0);

      const result = await service.fetchForAccount({accountId: accountId});

      expect(result.transactions).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('respects limit and offset', async () => {
      vi.mocked(mockTransactionRepo.findByAccountId).mockResolvedValue([]);
      vi.mocked(mockTransactionRepo.countByAccountId).mockResolvedValue(0);

      await service.fetchForAccount({
        accountId: accountId,
        limit: 5,
        offset: 10,
      });

      expect(mockTransactionRepo.findByAccountId).toHaveBeenCalledWith(
        accountId,
        {limit: 5, offset: 10},
      );
    });

    it('uses default limit=10 and offset=0', async () => {
      vi.mocked(mockTransactionRepo.findByAccountId).mockResolvedValue([]);
      vi.mocked(mockTransactionRepo.countByAccountId).mockResolvedValue(0);

      await service.fetchForAccount({accountId: accountId});

      expect(mockTransactionRepo.findByAccountId).toHaveBeenCalledWith(
        accountId,
        {limit: 10, offset: 0},
      );
    });
  });

  describe('setDescription', () => {
    it('calls saveDescription on repository with validated inputs', async () => {
      await service.setDescription({
        accountId: accountId,
        transactionHash: '0xabc123',
        description: 'Coffee',
      });

      expect(mockTransactionRepo.saveDescription).toHaveBeenCalledWith(
        TransactionHash.of('0xabc123'),
        accountId,
        'Coffee',
      );
    });
  });

  describe('deleteDescription', () => {
    it('calls deleteDescription on repository with validated inputs', async () => {
      await service.deleteDescription({
        accountId: accountId,
        transactionHash: '0xabc123',
      });

      expect(mockTransactionRepo.deleteDescription).toHaveBeenCalledWith(
        TransactionHash.of('0xabc123'),
        accountId,
      );
    });
  });
});
