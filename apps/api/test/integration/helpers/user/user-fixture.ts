import * as schema from '@bim/db';
import type {DbClient} from "../test-database";
import {DbFixture} from "./../db-fixture";
import {createTransactionData, createUserSettingsData} from "./user-test-data";

export class UserFixture extends DbFixture {

  static create(dbClient: DbClient): UserFixture {
    return new UserFixture(dbClient);
  }

  async insertUserSettings(
    accountId: string,
    data?: Partial<schema.NewUserSettingsRecord>,
  ): Promise<schema.UserSettingsRecord> {
    const settingsData = createUserSettingsData(accountId, data);
    const [inserted] = await this.db
      .insert(schema.userSettings)
      .values(settingsData)
      .returning();
    return inserted!;
  }

  async insertTransaction(
    accountId: string,
    data?: Partial<schema.NewTransactionRecord>,
  ): Promise<schema.TransactionRecord> {
    const txData = createTransactionData(accountId, data);
    const [inserted] = await this.db
      .insert(schema.transactions)
      .values(txData)
      .returning();
    return inserted!;
  }

}
