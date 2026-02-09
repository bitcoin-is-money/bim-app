import * as schema from "../../../../src/db/schema";
import {DbFixture} from "../db-fixture";
import type {DbClient} from "../test-database";
import {createAccountData} from "./account-test-data";

export class AccountFixture extends DbFixture {

  async insertAccount(data?: Partial<schema.NewAccountRecord>): Promise<schema.AccountRecord> {
    const accountData = createAccountData(data);
    const [inserted] = await this.db
      .insert(schema.accounts)
      .values(accountData)
      .returning();
    return inserted;
  }

  static create(dbClient: DbClient): AccountFixture {
    return new AccountFixture(dbClient);
  }

}
