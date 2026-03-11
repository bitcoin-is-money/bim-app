import * as schema from '@bim/db';
import type {Database} from '@bim/db/database';
import {AccountId} from "@bim/domain/account";
import {Session, SessionId} from "@bim/domain/auth";
import type {SessionRepository} from "@bim/domain/ports";
import {eq, lt} from 'drizzle-orm';
import {AbstractDrizzleRepository} from './abstract-drizzle.repository';

/**
 * Drizzle-based implementation of SessionRepository.
 */
export class DrizzleSessionRepository extends AbstractDrizzleRepository implements SessionRepository {
  constructor(db: Database) {
    super(db);
  }

  async save(session: Session): Promise<void> {
    await this.resolveDb()
      .insert(schema.sessions)
      .values({
        id: session.id,
        accountId: session.accountId,
        expiresAt: session.expiresAt,
        createdAt: session.createdAt,
      })
      .onConflictDoUpdate({
        target: schema.sessions.id,
        set: {
          expiresAt: session.expiresAt,
        },
      });
  }

  async findById(id: SessionId): Promise<Session | undefined> {
    const record = await this.resolveDb().query.sessions.findFirst({
      where: eq(schema.sessions.id, id),
    });

    if (!record) {
      return undefined;
    }

    return this.toSession(record);
  }

  async findByAccountId(accountId: AccountId): Promise<Session[]> {
    const records = await this.resolveDb().query.sessions.findMany({
      where: eq(schema.sessions.accountId, accountId),
    });

    return records.map((record) => this.toSession(record));
  }

  async delete(id: SessionId): Promise<void> {
    await this.resolveDb().delete(schema.sessions).where(eq(schema.sessions.id, id));
  }

  async deleteByAccountId(accountId: AccountId): Promise<void> {
    await this.resolveDb()
      .delete(schema.sessions)
      .where(eq(schema.sessions.accountId, accountId));
  }

  async deleteExpired(): Promise<number> {
    const result = await this.resolveDb()
      .delete(schema.sessions)
      .where(lt(schema.sessions.expiresAt, new Date()));

    return result.rowCount ?? 0;
  }

  private toSession(record: schema.SessionRecord): Session {
    return new Session(
      SessionId.of(record.id),
      AccountId.of(record.accountId),
      record.expiresAt,
      record.createdAt,
    );
  }
}
