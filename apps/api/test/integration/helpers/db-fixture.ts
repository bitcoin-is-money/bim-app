import type {DbClient} from "./test-database";

export class DbFixture {

  protected readonly db: DbClient;

  protected constructor(dbClient: DbClient) {
    this.db = dbClient;
  }
}
