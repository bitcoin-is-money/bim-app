import {AccountId, StarknetAddress} from '../account';
import {type TransactionData, TransactionHash, TransactionId, type TransactionType} from './types';

/**
 * Transaction entity representing a recorded blockchain transaction.
 */
export class Transaction {
  private constructor(
    readonly id: TransactionId,
    readonly accountId: AccountId,
    readonly transactionHash: TransactionHash,
    readonly blockNumber: bigint,
    readonly transactionType: TransactionType,
    readonly amount: string,
    readonly tokenAddress: StarknetAddress,
    readonly fromAddress: StarknetAddress,
    readonly toAddress: StarknetAddress,
    readonly timestamp: Date,
    readonly indexedAt: Date,
  ) {}

  /**
   * Creates a new transaction record.
   */
  static create(params: {
    id: TransactionId;
    accountId: AccountId;
    transactionHash: TransactionHash;
    blockNumber: bigint;
    transactionType: TransactionType;
    amount: string;
    tokenAddress: StarknetAddress;
    fromAddress: StarknetAddress;
    toAddress: StarknetAddress;
    timestamp: Date;
  }): Transaction {
    return new Transaction(
      params.id,
      params.accountId,
      params.transactionHash,
      params.blockNumber,
      params.transactionType,
      params.amount,
      params.tokenAddress,
      params.fromAddress,
      params.toAddress,
      params.timestamp,
      new Date(),
    );
  }

  /**
   * Reconstitutes transaction from persisted data.
   */
  static fromData(data: TransactionData): Transaction {
    return new Transaction(
      data.id,
      data.accountId,
      data.transactionHash,
      data.blockNumber,
      data.transactionType,
      data.amount,
      data.tokenAddress,
      data.fromAddress,
      data.toAddress,
      data.timestamp,
      data.indexedAt,
    );
  }

  /**
   * Returns whether this is a receipt (incoming) transaction.
   */
  isReceipt(): boolean {
    return this.transactionType === 'receipt';
  }

  /**
   * Returns whether this is a spent (outgoing) transaction.
   */
  isSpent(): boolean {
    return this.transactionType === 'spent';
  }

  /**
   * Exports the transaction data for persistence.
   */
  toData(): TransactionData {
    return {
      id: this.id,
      accountId: this.accountId,
      transactionHash: this.transactionHash,
      blockNumber: this.blockNumber,
      transactionType: this.transactionType,
      amount: this.amount,
      tokenAddress: this.tokenAddress,
      fromAddress: this.fromAddress,
      toAddress: this.toAddress,
      timestamp: this.timestamp,
      indexedAt: this.indexedAt,
    };
  }
}
