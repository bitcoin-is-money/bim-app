import {basename} from 'node:path';
import * as schema from '@bim/db';
import {isNotNull} from 'drizzle-orm';
import type {Logger} from 'pino';
import type {AccountMatch} from './types.js';

export class AccountCache {
  private accounts: AccountMatch[] = [];
  private lastFetchedAt = 0;
  private readonly ttlMs: number;
  private readonly logger: Logger;

  constructor(ttlMs: number, logger: Logger) {
    this.ttlMs = ttlMs;
    this.logger = logger.child({name: basename(import.meta.filename)});
  }

  // Returns cached accounts, refreshing from DB when TTL has expired.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Apibara's drizzle plugin db type is internal
  async get(db: any): Promise<AccountMatch[]> {
    if (Date.now() - this.lastFetchedAt < this.ttlMs) {
      return this.accounts;
    }

    this.accounts = await db
      .select({
        id: schema.accounts.id,
        starknetAddress: schema.accounts.starknetAddress,
      })
      .from(schema.accounts)
      .where(isNotNull(schema.accounts.starknetAddress)) as AccountMatch[];

    this.lastFetchedAt = Date.now();
    this.logger.debug(`Account cache refreshed (${this.accounts.length})`);
    return this.accounts;
  }
}
