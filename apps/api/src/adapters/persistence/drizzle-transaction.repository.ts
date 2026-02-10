import {AccountId, StarknetAddress} from '@bim/domain/account';
import type {TransactionPaginationOptions, TransactionRepository} from "@bim/domain/ports";
import {Transaction, TransactionHash, TransactionId, type TransactionType} from "@bim/domain/user";
import {count, desc, eq} from 'drizzle-orm';
import type {NodePgDatabase} from 'drizzle-orm/node-postgres';
import * as schema from '../../db/schema.js';

/**
 * Drizzle-based implementation of TransactionRepository.
 */
export class DrizzleTransactionRepository implements TransactionRepository {

  constructor(
    private readonly db: NodePgDatabase<typeof schema>
  ) {}

  async save(transaction: Transaction): Promise<void> {
    const data = transaction.toData();

    await this.db
      .insert(schema.transactions)
      .values({
        id: data.id,
        accountId: data.accountId,
        transactionHash: data.transactionHash,
        blockNumber: data.blockNumber.toString(),
        transactionType: data.transactionType,
        amount: data.amount,
        tokenAddress: data.tokenAddress,
        fromAddress: data.fromAddress,
        toAddress: data.toAddress,
        timestamp: data.timestamp,
        indexedAt: data.indexedAt,
      })
      .onConflictDoNothing();
  }

  async saveMany(transactions: Transaction[]): Promise<void> {
    if (transactions.length === 0) {
      return;
    }

    const values = transactions.map((tx) => {
      const data = tx.toData();
      return {
        id: data.id,
        accountId: data.accountId,
        transactionHash: data.transactionHash,
        blockNumber: data.blockNumber.toString(),
        transactionType: data.transactionType,
        amount: data.amount,
        tokenAddress: data.tokenAddress,
        fromAddress: data.fromAddress,
        toAddress: data.toAddress,
        timestamp: data.timestamp,
        indexedAt: data.indexedAt,
      };
    });

    await this.db
      .insert(schema.transactions)
      .values(values)
      .onConflictDoNothing();
  }

  async findById(id: TransactionId): Promise<Transaction | undefined> {
    const record = await this.db.query.transactions.findFirst({
      where: eq(schema.transactions.id, id),
    });

    if (!record) {
      return undefined;
    }

    return this.toTransaction(record);
  }

  async findByHash(hash: TransactionHash): Promise<Transaction | undefined> {
    const record = await this.db.query.transactions.findFirst({
      where: eq(schema.transactions.transactionHash, hash),
    });

    if (!record) {
      return undefined;
    }

    return this.toTransaction(record);
  }

  async findByAccountId(
    accountId: AccountId,
    options: TransactionPaginationOptions,
  ): Promise<Transaction[]> {
    const records = await this.db.query.transactions.findMany({
      where: eq(schema.transactions.accountId, accountId),
      orderBy: [desc(schema.transactions.timestamp)],
      limit: options.limit,
      offset: options.offset,
    });

    return records.map((record) => this.toTransaction(record));
  }

  async countByAccountId(accountId: AccountId): Promise<number> {
    const result = await this.db
      .select({count: count()})
      .from(schema.transactions)
      .where(eq(schema.transactions.accountId, accountId));

    return result[0]?.count ?? 0;
  }

  async existsByHash(hash: TransactionHash): Promise<boolean> {
    const record = await this.db.query.transactions.findFirst({
      where: eq(schema.transactions.transactionHash, hash),
      columns: {id: true},
    });

    return record !== undefined;
  }

  private toTransaction(record: schema.TransactionRecord): Transaction {
    return Transaction.fromData({
      id: TransactionId.of(record.id),
      accountId: AccountId.of(record.accountId),
      transactionHash: TransactionHash.of(record.transactionHash),
      blockNumber: BigInt(record.blockNumber),
      transactionType: record.transactionType as TransactionType,
      amount: record.amount,
      tokenAddress: StarknetAddress.of(record.tokenAddress),
      fromAddress: StarknetAddress.of(record.fromAddress),
      toAddress: StarknetAddress.of(record.toAddress),
      timestamp: record.timestamp,
      indexedAt: record.indexedAt,
    });
  }
}
