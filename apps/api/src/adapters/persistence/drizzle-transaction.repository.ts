import * as schema from '@bim/db';
import {AccountId, StarknetAddress} from '@bim/domain/account';
import type {TransactionPaginationOptions, TransactionRepository} from "@bim/domain/ports";
import {Transaction, TransactionHash, TransactionId, type TransactionType} from "@bim/domain/user";
import {and, count, desc, eq} from 'drizzle-orm';
import type {NodePgDatabase} from 'drizzle-orm/node-postgres';

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
    const rows = await this.db
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

    if (rows.length === 0) {
      return undefined;
    }

    return this.toTransaction(rows[0].transaction, rows[0].description);
  }

  async findByHash(hash: TransactionHash): Promise<Transaction | undefined> {
    const rows = await this.db
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

    if (rows.length === 0) {
      return undefined;
    }

    return this.toTransaction(rows[0].transaction, rows[0].description);
  }

  async findByAccountId(
    accountId: AccountId,
    options: TransactionPaginationOptions,
  ): Promise<Transaction[]> {
    const rows = await this.db
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

  async saveDescription(transactionHash: TransactionHash, accountId: AccountId, description: string): Promise<void> {
    await this.db
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
    await this.db
      .delete(schema.transactionDescriptions)
      .where(
        and(
          eq(schema.transactionDescriptions.transactionHash, transactionHash),
          eq(schema.transactionDescriptions.accountId, accountId),
        ),
      );
  }

  private toTransaction(record: schema.TransactionRecord, description: string | null): Transaction {
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
      description: description ?? undefined,
    });
  }
}
