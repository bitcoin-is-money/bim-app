import { StarknetAddress } from '../account/types';
import { type TransactionData, TransactionHash, TransactionId, type TransactionType, UserAddressId } from './types';
/**
 * Transaction entity representing a recorded blockchain transaction.
 */
export declare class Transaction {
    readonly id: TransactionId;
    readonly userAddressId: UserAddressId;
    readonly transactionHash: TransactionHash;
    readonly blockNumber: bigint;
    readonly transactionType: TransactionType;
    readonly amount: string;
    readonly tokenAddress: StarknetAddress;
    readonly fromAddress: StarknetAddress;
    readonly toAddress: StarknetAddress;
    readonly timestamp: Date;
    readonly processedAt: Date;
    private constructor();
    /**
     * Creates a new transaction record.
     */
    static create(params: {
        id: TransactionId;
        userAddressId: UserAddressId;
        transactionHash: TransactionHash;
        blockNumber: bigint;
        transactionType: TransactionType;
        amount: string;
        tokenAddress: StarknetAddress;
        fromAddress: StarknetAddress;
        toAddress: StarknetAddress;
        timestamp: Date;
    }): Transaction;
    /**
     * Reconstitutes transaction from persisted data.
     */
    static fromData(data: TransactionData): Transaction;
    /**
     * Returns whether this is a receipt (incoming) transaction.
     */
    isReceipt(): boolean;
    /**
     * Returns whether this is a spent (outgoing) transaction.
     */
    isSpent(): boolean;
    /**
     * Exports the transaction data for persistence.
     */
    toData(): TransactionData;
}
//# sourceMappingURL=transaction.d.ts.map