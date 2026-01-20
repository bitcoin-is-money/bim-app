import { AccountId } from '../account/types';
import { FiatCurrency, type UserSettingsData, UserSettingsId } from './types';
/**
 * UserSettings entity representing user preferences.
 */
export declare class UserSettings {
    readonly id: UserSettingsId;
    readonly accountId: AccountId;
    readonly createdAt: Date;
    private fiatCurrency;
    private updatedAt;
    private constructor();
    /**
     * Creates new user settings with default values.
     */
    static create(params: {
        id: UserSettingsId;
        accountId: AccountId;
    }): UserSettings;
    /**
     * Reconstitutes user settings from persisted data.
     */
    static fromData(data: UserSettingsData): UserSettings;
    /**
     * Returns the preferred fiat currency.
     */
    getFiatCurrency(): FiatCurrency;
    /**
     * Returns the last update timestamp.
     */
    getUpdatedAt(): Date;
    /**
     * Updates the preferred fiat currency.
     */
    setFiatCurrency(currency: FiatCurrency): void;
    /**
     * Exports the settings data for persistence.
     */
    toData(): UserSettingsData;
}
//# sourceMappingURL=user-settings.d.ts.map