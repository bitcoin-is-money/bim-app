import {AccountId} from '@bim/domain/account';
import {UserSettings} from '@bim/domain/user';

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
