import type {AccountId} from '../account';
import type {UserSettings} from '../user';

/**
 * Repository interface for UserSettings persistence.
 */
export interface UserSettingsRepository {
  /**
   * Saves user settings (insert or update).
   */
  save(settings: UserSettings): Promise<void>;

  /**
   * Finds user settings by account ID.
   */
  findByAccountId(accountId: AccountId): Promise<UserSettings | undefined>;
}
