import {Database} from '@bim/db/database';
import type {DrizzleDatabase} from '@bim/db/database';

export abstract class AbstractDrizzleRepository {

  protected constructor(
    private readonly db: Database,
  ) {}

  protected resolveDb(): DrizzleDatabase {
    return this.db.resolveDb();
  }
}
