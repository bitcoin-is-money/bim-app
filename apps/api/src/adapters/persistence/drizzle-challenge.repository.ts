import * as schema from '@bim/db';
import {Challenge, ChallengeId, type ChallengePurpose} from "@bim/domain/auth";
import type {ChallengeRepository} from "@bim/domain/ports";
import {and, eq, gt} from 'drizzle-orm';
import {AbstractDrizzleRepository} from './abstract-drizzle.repository';

/**
 * Drizzle-based implementation of ChallengeRepository.
 */
export class DrizzleChallengeRepository extends AbstractDrizzleRepository implements ChallengeRepository {

  async save(challenge: Challenge): Promise<void> {
    await this.resolveDb()
      .insert(schema.challenges)
      .values({
        id: challenge.id,
        challenge: challenge.challenge,
        purpose: challenge.purpose,
        rpId: challenge.rpId,
        origin: challenge.origin,
        accountId: challenge.accountId ?? null,
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
    const record = await this.resolveDb().query.challenges.findFirst({
      where: eq(schema.challenges.id, id),
    });

    if (!record) {
      return undefined;
    }

    return this.toChallenge(record);
  }

  async consumeById(id: ChallengeId): Promise<Challenge | undefined> {
    const [row] = await this.resolveDb()
      .update(schema.challenges)
      .set({used: true})
      .where(
        and(
          eq(schema.challenges.id, id),
          eq(schema.challenges.used, false),
          gt(schema.challenges.expiresAt, new Date()),
        ),
      )
      .returning();

    if (!row) {
      return undefined;
    }

    return this.toChallenge(row);
  }

  async findByChallenge(challenge: string): Promise<Challenge | undefined> {
    const record = await this
      .resolveDb().query.challenges.findFirst({
        where: eq(schema.challenges.challenge, challenge),
      });

    if (!record) {
      return undefined;
    }

    return this.toChallenge(record);
  }

  async delete(id: ChallengeId): Promise<void> {
    await this.resolveDb()
      .delete(schema.challenges)
      .where(eq(schema.challenges.id, id));
  }

  private toChallenge(record: schema.ChallengeRecord): Challenge {
    return new Challenge(
      ChallengeId.of(record.id),
      record.challenge,
      record.purpose as ChallengePurpose,
      record.rpId ?? undefined,
      record.origin ?? undefined,
      record.accountId ?? undefined,
      record.expiresAt,
      record.createdAt,
      record.used,
    );
  }
}
