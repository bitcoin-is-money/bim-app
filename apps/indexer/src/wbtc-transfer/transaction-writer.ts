import type {NewTransactionRecord} from '@bim/db';
import * as schema from '@bim/db';
import type {Logger} from 'pino';
import type {ApibaraDb} from './types.js';

export class TransactionWriter {
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({name: 'transaction-writer.ts'});
  }

  /**
   * Insert transaction rows into the database, ignoring duplicates.
   */
  async write(db: ApibaraDb, rows: NewTransactionRecord[], blockNumber: string): Promise<void> {
    if (rows.length === 0) {
      this.logger.debug(`[Block ${blockNumber}] No rows to write in DB`);
      return;
    }

    await db
      .insert(schema.transactions)
      .values(rows)
      .onConflictDoNothing();

    this.logger.info(`[Block ${blockNumber}] Transactions wrote in DB (${rows.length})`);
  }
}
