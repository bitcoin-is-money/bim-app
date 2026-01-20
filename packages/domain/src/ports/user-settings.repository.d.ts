import { AccountId } from '../account/types';
import { UserSettings } from '../user/user-settings';
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
//# sourceMappingURL=user-settings.repository.d.ts.map