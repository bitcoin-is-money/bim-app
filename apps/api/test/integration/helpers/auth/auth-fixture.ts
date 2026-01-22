import * as schema from "../../../../database/schema";
import type {DbClient} from "../test-database";
import {DbFixture} from "./../db-fixture";
import {createChallengeData, createSessionData} from "./auth-test-data";

export class AuthFixture extends DbFixture {

  static create(dbClient: DbClient): AuthFixture {
    return new AuthFixture(dbClient);
  }

  /**
   * Creates a test session record
   */
  async insertSession(
    accountId: string,
    data?: Partial<schema.NewSessionRecord>,
  ): Promise<schema.SessionRecord> {
    const sessionData = createSessionData(accountId, data);
    const [inserted] = await this.db
      .insert(schema.sessions)
      .values(sessionData)
      .returning();
    return inserted;
  }

  async insertChallenge(data?: Partial<schema.NewChallengeRecord>): Promise<schema.ChallengeRecord> {
    const challengeData = createChallengeData(data);
    const [inserted] = await this.db
      .insert(schema.challenges)
      .values(challengeData)
      .returning();
    return inserted;
  }

}
