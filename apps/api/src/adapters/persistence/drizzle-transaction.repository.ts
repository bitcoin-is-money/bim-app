import * as schema from '@bim/db';
import type {Database} from '@bim/db/database';
import {AccountId, StarknetAddress} from '@bim/domain/account';
import type {TransactionPaginationOptions, TransactionRepository} from "@bim/domain/ports";
import {Transaction, TransactionHash, TransactionId, type TransactionType} from "@bim/domain/user";
import {and, count, desc, eq} from 'drizzle-orm';
import {AbstractDrizzleRepository} from './abstract-drizzle.repository';

/**
 * Drizzle-based implementation of TransactionRepository.
 */
export class DrizzleTransactionRepository extends AbstractDrizzleRepository implements TransactionRepository {

  constructor(db: Database) {
    super(db);
  }

  async save(transaction: Transaction): Promise<void> {
    await this.resolveDb()
      .insert(schema.transactions)
      .values({
        id: transaction.id,
        accountId: transaction.accountId,
        transactionHash: transaction.transactionHash,
        blockNumber: transaction.blockNumber.toString(),
        transactionType: transaction.transactionType,
        amount: transaction.amount,
        tokenAddress: transaction.tokenAddress,
        fromAddress: transaction.fromAddress,
        toAddress: transaction.toAddress,
        timestamp: transaction.timestamp,
        indexedAt: transaction.indexedAt,
      })
      .onConflictDoNothing();
  }

  async saveMany(transactions: Transaction[]): Promise<void> {
    if (transactions.length === 0) {
      return;
    }

    const values = transactions.map((tx) => ({
      id: tx.id,
      accountId: tx.accountId,
      transactionHash: tx.transactionHash,
      blockNumber: tx.blockNumber.toString(),
      transactionType: tx.transactionType,
      amount: tx.amount,
      tokenAddress: tx.tokenAddress,
      fromAddress: tx.fromAddress,
      toAddress: tx.toAddress,
      timestamp: tx.timestamp,
      indexedAt: tx.indexedAt,
    }));

    await this.resolveDb()
      .insert(schema.transactions)
      .values(values)
      .onConflictDoNothing();
  }

  async findById(id: TransactionId): Promise<Transaction | undefined> {
    const rows = await this.resolveDb()
      .select({
        transaction: schema.transactions,
        description: schema.transactionDescriptions.description,
      })
      .from(schema.transactions)
      .leftJoin(
        schema.transactionDescriptions,
        and(
          eq(schema.transactions.transactionHash, schema.transactionDescriptions.transactionHash),
          eq(schema.transactions.accountId, schema.transactionDescriptions.accountId),
        ),
      )
      .where(eq(schema.transactions.id, id))
      .limit(1);
    const row = rows.at(0);
    if (!row) {
      return undefined;
    }
    return this.toTransaction(row.transaction, row.description);
  }

  async findByHash(hash: TransactionHash): Promise<Transaction | undefined> {
    const rows = await this.resolveDb()
      .select({
        transaction: schema.transactions,
        description: schema.transactionDescriptions.description,
      })
      .from(schema.transactions)
      .leftJoin(
        schema.transactionDescriptions,
        and(
          eq(schema.transactions.transactionHash, schema.transactionDescriptions.transactionHash),
          eq(schema.transactions.accountId, schema.transactionDescriptions.accountId),
        ),
      )
      .where(eq(schema.transactions.transactionHash, hash))
      .limit(1);

    const row = rows.at(0);
    if (!row) {
      return undefined;
    }
    return this.toTransaction(row.transaction, row.description);
  }

  async findByAccountId(
    accountId: AccountId,
    options: TransactionPaginationOptions,
  ): Promise<Transaction[]> {
    const rows = await this.resolveDb()
      .select({
        transaction: schema.transactions,
        description: schema.transactionDescriptions.description,
      })
      .from(schema.transactions)
      .leftJoin(
        schema.transactionDescriptions,
        and(
          eq(schema.transactions.transactionHash, schema.transactionDescriptions.transactionHash),
          eq(schema.transactions.accountId, schema.transactionDescriptions.accountId),
        ),
      )
      .where(eq(schema.transactions.accountId, accountId))
      .orderBy(desc(schema.transactions.timestamp))
      .limit(options.limit)
      .offset(options.offset);

    return rows.map((row) => this.toTransaction(row.transaction, row.description));
  }

  async countByAccountId(accountId: AccountId): Promise<number> {
    const result = await this.resolveDb()
      .select({count: count()})
      .from(schema.transactions)
      .where(eq(schema.transactions.accountId, accountId));

    return result[0]?.count ?? 0;
  }

  async existsByHash(hash: TransactionHash): Promise<boolean> {
    const record = await this.resolveDb().query.transactions.findFirst({
      where: eq(schema.transactions.transactionHash, hash),
      columns: {id: true},
    });

    return record !== undefined;
  }

  async saveDescription(transactionHash: TransactionHash, accountId: AccountId, description: string): Promise<void> {
    await this.resolveDb()
      .insert(schema.transactionDescriptions)
      .values({
        id: crypto.randomUUID(),
        transactionHash,
        accountId,
        description,
      })
      .onConflictDoUpdate({
        target: [schema.transactionDescriptions.transactionHash, schema.transactionDescriptions.accountId],
        set: {description},
      });
  }

  async deleteDescription(transactionHash: TransactionHash, accountId: AccountId): Promise<void> {
    await this.resolveDb()
      .delete(schema.transactionDescriptions)
      .where(
        and(
          eq(schema.transactionDescriptions.transactionHash, transactionHash),
          eq(schema.transactionDescriptions.accountId, accountId),
        ),
      );
  }

  private toTransaction(record: schema.TransactionRecord, description: string | null): Transaction {
    return new Transaction(
      TransactionId.of(record.id),
      AccountId.of(record.accountId),
      TransactionHash.of(record.transactionHash),
      BigInt(record.blockNumber),
      record.transactionType as TransactionType,
      record.amount,
      StarknetAddress.of(record.tokenAddress),
      StarknetAddress.of(record.fromAddress),
      StarknetAddress.of(record.toAddress),
      record.timestamp,
      record.indexedAt,
      description ?? (record.transactionType === 'receipt' ? 'Received' : 'Sent'),
    );
  }
}
