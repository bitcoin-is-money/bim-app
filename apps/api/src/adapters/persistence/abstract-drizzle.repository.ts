import type {Database, DrizzleDatabase} from '@bim/db/database';

export abstract class AbstractDrizzleRepository {

  public constructor(
    private readonly db: Database,
  ) {}

  protected resolveDb(): DrizzleDatabase {
    return this.db.resolveDb();
  }
}
