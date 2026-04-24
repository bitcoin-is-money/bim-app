import type {UserSettings} from '../user-settings';

export interface FetchUserSettingsInput {
  accountId: string;
}

export interface FetchUserSettingsOutput {
  settings: UserSettings;
}

/**
 * Fetches user settings for an account.
 */
export interface FetchSettingsUseCase {
  fetch(input: FetchUserSettingsInput): Promise<FetchUserSettingsOutput>;
}
