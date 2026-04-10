import type {Database} from '@bim/db/database';
import type {TransactionManager} from '@bim/domain/ports';

export class DrizzleTransactionManager implements TransactionManager {

  constructor(
    private readonly db: Database
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    return this.db.withTransaction(fn);
  }
}
