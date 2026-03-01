import {AccountId, StarknetAddress} from '../account';
import {TransactionHash, TransactionId, type TransactionType} from './types';

/**
 * Transaction entity representing a recorded blockchain transaction.
 */
export class Transaction {
  constructor(
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
    readonly description: string,
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
    description: string;
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
      params.description,
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

}
