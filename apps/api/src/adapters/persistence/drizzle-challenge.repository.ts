import {AccountId, Challenge, ChallengeId, type ChallengePurpose, type ChallengeRepository,} from '@bim/domain';
import {eq, lt} from 'drizzle-orm';
import type {NodePgDatabase} from 'drizzle-orm/node-postgres';
import * as schema from '../../../database/schema.js';

/**
 * Drizzle-based implementation of ChallengeRepository.
 */
export class DrizzleChallengeRepository implements ChallengeRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async save(challenge: Challenge): Promise<void> {
    const data = challenge.toData();

    await this.db
      .insert(schema.challenges)
      .values({
        id: data.id,
        challenge: data.challenge,
        purpose: data.purpose,
        accountId: data.accountId,
        rpId: data.rpId,
        origin: data.origin,
        used: data.used,
        expiresAt: data.expiresAt,
        createdAt: data.createdAt,
      })
      .onConflictDoUpdate({
        target: schema.challenges.id,
        set: {
          used: data.used,
        },
      });
  }

  async findById(id: ChallengeId): Promise<Challenge | undefined> {
    const record = await this.db.query.challenges.findFirst({
      where: eq(schema.challenges.id, id),
    });

    if (!record) {
      return undefined;
    }

    return this.toChallenge(record);
  }

  async findByChallenge(challenge: string): Promise<Challenge | undefined> {
    const record = await this.db.query.challenges.findFirst({
      where: eq(schema.challenges.challenge, challenge),
    });

    if (!record) {
      return undefined;
    }

    return this.toChallenge(record);
  }

  async delete(id: ChallengeId): Promise<void> {
    await this.db
      .delete(schema.challenges)
      .where(eq(schema.challenges.id, id));
  }

  async deleteExpired(): Promise<number> {
    const result = await this.db
      .delete(schema.challenges)
      .where(lt(schema.challenges.expiresAt, new Date()));

    return result.rowCount ?? 0;
  }

  private toChallenge(record: schema.ChallengeRecord): Challenge {
    return Challenge.fromData({
      id: ChallengeId.of(record.id),
      challenge: record.challenge,
      purpose: record.purpose as ChallengePurpose,
      accountId: record.accountId ? AccountId.of(record.accountId) : undefined,
      rpId: record.rpId ?? undefined,
      origin: record.origin ?? undefined,
      used: record.used,
      expiresAt: record.expiresAt,
      createdAt: record.createdAt,
    });
  }
}
