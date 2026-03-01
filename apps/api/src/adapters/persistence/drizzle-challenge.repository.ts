import * as schema from '@bim/db';
import {Challenge, ChallengeId, type ChallengePurpose} from "@bim/domain/auth";
import type {ChallengeRepository} from "@bim/domain/ports";
import {eq, lt} from 'drizzle-orm';
import type {NodePgDatabase} from 'drizzle-orm/node-postgres';

/**
 * Drizzle-based implementation of ChallengeRepository.
 */
export class DrizzleChallengeRepository implements ChallengeRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async save(challenge: Challenge): Promise<void> {
    await this.db
      .insert(schema.challenges)
      .values({
        id: challenge.id,
        challenge: challenge.challenge,
        purpose: challenge.purpose,
        rpId: challenge.rpId,
        origin: challenge.origin,
        used: challenge.isUsed(),
        expiresAt: challenge.expiresAt,
        createdAt: challenge.createdAt,
      })
      .onConflictDoUpdate({
        target: schema.challenges.id,
        set: {
          used: challenge.isUsed(),
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
    return new Challenge(
      ChallengeId.of(record.id),
      record.challenge,
      record.purpose as ChallengePurpose,
      record.rpId ?? undefined,
      record.origin ?? undefined,
      record.expiresAt,
      record.createdAt,
      record.used,
    );
  }
}
