import type {FiatCurrency} from '../../currency';
import type {Language} from '../language';
import type {UserSettings} from '../user-settings';

export interface UserSettingsUpdate {
  preferredCurrencies: [FiatCurrency, ...FiatCurrency[]];
  defaultCurrency: FiatCurrency;
  language: Language;
}

export type UpdateUserSettingsInput = {
  accountId: string;
} & Partial<UserSettingsUpdate>;

export interface UpdateUserSettingsOutput {
  settings: UserSettings;
}

/**
 * Updates user settings for an account.
 */
export interface UpdateSettingsUseCase {
  update(input: UpdateUserSettingsInput): Promise<UpdateUserSettingsOutput>;
}
