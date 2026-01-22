import {AccountId, Session, SessionId, type SessionRepository,} from '@bim/domain';
import {eq, lt} from 'drizzle-orm';
import type {NodePgDatabase} from 'drizzle-orm/node-postgres';
import * as schema from '../../../database/schema.js';

/**
 * Drizzle-based implementation of SessionRepository.
 */
export class DrizzleSessionRepository implements SessionRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async save(session: Session): Promise<void> {
    const data = session.toData();

    await this.db
      .insert(schema.sessions)
      .values({
        id: data.id,
        accountId: data.accountId,
        expiresAt: data.expiresAt,
        createdAt: data.createdAt,
      })
      .onConflictDoUpdate({
        target: schema.sessions.id,
        set: {
          expiresAt: data.expiresAt,
        },
      });
  }

  async findById(id: SessionId): Promise<Session | undefined> {
    const record = await this.db.query.sessions.findFirst({
      where: eq(schema.sessions.id, id),
    });

    if (!record) {
      return undefined;
    }

    return this.toSession(record);
  }

  async findByAccountId(accountId: AccountId): Promise<Session[]> {
    const records = await this.db.query.sessions.findMany({
      where: eq(schema.sessions.accountId, accountId),
    });

    return records.map((record) => this.toSession(record));
  }

  async delete(id: SessionId): Promise<void> {
    await this.db.delete(schema.sessions).where(eq(schema.sessions.id, id));
  }

  async deleteByAccountId(accountId: AccountId): Promise<void> {
    await this.db
      .delete(schema.sessions)
      .where(eq(schema.sessions.accountId, accountId));
  }

  async deleteExpired(): Promise<number> {
    const result = await this.db
      .delete(schema.sessions)
      .where(lt(schema.sessions.expiresAt, new Date()));

    return result.rowCount ?? 0;
  }

  private toSession(record: schema.SessionRecord): Session {
    return Session.fromData({
      id: SessionId.of(record.id),
      accountId: AccountId.of(record.accountId),
      expiresAt: record.expiresAt,
      createdAt: record.createdAt,
    });
  }
}
