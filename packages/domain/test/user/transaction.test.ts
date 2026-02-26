import {AccountId, StarknetAddress} from "@bim/domain/account";
import {Transaction, TransactionHash, TransactionId} from '@bim/domain/user';
import {describe, expect, it} from 'vitest';

describe('Transaction', () => {
  const transactionId = TransactionId.of('550e8400-e29b-41d4-a716-446655440000');
  const accountId = AccountId.of('660e8400-e29b-41d4-a716-446655440001');
  const transactionHash = TransactionHash.of('0xabc123');
  const tokenAddress = StarknetAddress.of('0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7');
  const fromAddress = StarknetAddress.of('0x111');
  const toAddress = StarknetAddress.of('0x222');

  describe('create', () => {
    it('creates receipt transaction', () => {
      const tx = Transaction.create({
        id: transactionId,
        accountId,
        transactionHash,
        blockNumber: 12345n,
        transactionType: 'receipt',
        amount: '1000000000000000000',
        tokenAddress,
        fromAddress,
        toAddress,
        timestamp: new Date('2024-01-15T12:00:00Z'),
        description: 'Received',
      });

      expect(tx.id).toBe(transactionId);
      expect(tx.accountId).toBe(accountId);
      expect(tx.transactionHash).toBe(transactionHash);
      expect(tx.blockNumber).toBe(12345n);
      expect(tx.transactionType).toBe('receipt');
      expect(tx.amount).toBe('1000000000000000000');
      expect(tx.isReceipt()).toBe(true);
      expect(tx.isSpent()).toBe(false);
    });

    it('creates spent transaction', () => {
      const tx = Transaction.create({
        id: transactionId,
        accountId,
        transactionHash,
        blockNumber: 12345n,
        transactionType: 'spent',
        amount: '500000000000000000',
        tokenAddress,
        fromAddress,
        toAddress,
        timestamp: new Date('2024-01-15T12:00:00Z'),
        description: 'Sent',
      });

      expect(tx.transactionType).toBe('spent');
      expect(tx.isSpent()).toBe(true);
      expect(tx.isReceipt()).toBe(false);
    });

    it('sets indexedAt to current time', () => {
      const before = new Date();
      const tx = Transaction.create({
        id: transactionId,
        accountId,
        transactionHash,
        blockNumber: 12345n,
        transactionType: 'receipt',
        amount: '1000',
        tokenAddress,
        fromAddress,
        toAddress,
        timestamp: new Date('2024-01-15T12:00:00Z'),
        description: 'Received',
      });
      const after = new Date();

      expect(tx.indexedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(tx.indexedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('creates transaction with description', () => {
      const tx = Transaction.create({
        id: transactionId,
        accountId,
        transactionHash,
        blockNumber: 12345n,
        transactionType: 'receipt',
        amount: '1000',
        tokenAddress,
        fromAddress,
        toAddress,
        timestamp: new Date('2024-01-15T12:00:00Z'),
        description: 'Coffee payment',
      });

      expect(tx.description).toBe('Coffee payment');
    });

    it('creates transaction with empty description', () => {
      const tx = Transaction.create({
        id: transactionId,
        accountId,
        transactionHash,
        blockNumber: 12345n,
        transactionType: 'receipt',
        amount: '1000',
        tokenAddress,
        fromAddress,
        toAddress,
        timestamp: new Date('2024-01-15T12:00:00Z'),
        description: '',
      });

      expect(tx.description).toBe('');
    });
  });

  describe('fromData', () => {
    it('reconstitutes transaction from persisted data with description', () => {
      const data = {
        id: transactionId,
        accountId,
        transactionHash,
        blockNumber: 99999n,
        transactionType: 'spent' as const,
        amount: '123456789',
        tokenAddress,
        fromAddress,
        toAddress,
        timestamp: new Date('2024-02-01T10:00:00Z'),
        indexedAt: new Date('2024-02-01T10:05:00Z'),
        description: 'Rent',
      };

      const tx = Transaction.fromData(data);

      expect(tx.id).toBe(transactionId);
      expect(tx.blockNumber).toBe(99999n);
      expect(tx.amount).toBe('123456789');
      expect(tx.timestamp).toEqual(data.timestamp);
      expect(tx.indexedAt).toEqual(data.indexedAt);
      expect(tx.description).toBe('Rent');
    });

  });

  describe('toData', () => {
    it('exports all transaction data', () => {
      const timestamp = new Date('2024-01-15T12:00:00Z');
      const tx = Transaction.create({
        id: transactionId,
        accountId,
        transactionHash,
        blockNumber: 12345n,
        transactionType: 'receipt',
        amount: '1000000000000000000',
        tokenAddress,
        fromAddress,
        toAddress,
        timestamp,
        description: 'Received',
      });

      const data = tx.toData();

      expect(data.id).toBe(transactionId);
      expect(data.accountId).toBe(accountId);
      expect(data.transactionHash).toBe(transactionHash);
      expect(data.blockNumber).toBe(12345n);
      expect(data.transactionType).toBe('receipt');
      expect(data.amount).toBe('1000000000000000000');
      expect(data.tokenAddress).toBe(tokenAddress);
      expect(data.fromAddress).toBe(fromAddress);
      expect(data.toAddress).toBe(toAddress);
      expect(data.timestamp).toEqual(timestamp);
      expect(data.indexedAt).toBeDefined();
      expect(data.description).toBe('Received');
    });

    it('exports description when set', () => {
      const tx = Transaction.create({
        id: transactionId,
        accountId,
        transactionHash,
        blockNumber: 12345n,
        transactionType: 'receipt',
        amount: '1000',
        tokenAddress,
        fromAddress,
        toAddress,
        timestamp: new Date(),
        description: 'Groceries',
      });

      expect(tx.toData().description).toBe('Groceries');
    });
  });
});
