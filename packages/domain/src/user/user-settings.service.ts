import {AccountId} from '../account';
import type {UserSettingsRepository} from '../ports';
import {FiatCurrency, Language, UserSettingsId} from './types';
import {UserSettings} from './user-settings';

// =============================================================================
// Dependencies
// =============================================================================

export interface UserSettingsServiceDeps {
  userSettingsRepository: UserSettingsRepository;
}

// =============================================================================
// Input/Output Types
// =============================================================================

export interface FetchUserSettingsInput {
  accountId: string;
}

export interface FetchUserSettingsOutput {
  settings: UserSettings;
}

export interface UpdateUserSettingsInput {
  accountId: string;
  fiatCurrency?: string;
  language?: string;
}

export interface UpdateUserSettingsOutput {
  settings: UserSettings;
}

// =============================================================================
// Service Class
// =============================================================================

/**
 * Service for user settings management.
 */
export class UserSettingsService {
  constructor(private readonly deps: UserSettingsServiceDeps) {}

  /**
   * Fetches user settings for an account.
   * Creates default settings if none exist.
   */
  async fetch(input: FetchUserSettingsInput): Promise<FetchUserSettingsOutput> {
    const accountId = AccountId.of(input.accountId);

    let settings = await this.deps.userSettingsRepository.findByAccountId(accountId);

    if (!settings) {
      // Create default settings
      settings = UserSettings.create({
        id: UserSettingsId.generate(),
        accountId,
      });
      await this.deps.userSettingsRepository.save(settings);
    }

    return {settings};
  }

  /**
   * Updates user settings for an account.
   * Creates settings if they don't exist.
   */
  async update(input: UpdateUserSettingsInput): Promise<UpdateUserSettingsOutput> {
    const accountId = AccountId.of(input.accountId);

    let settings = await this.deps.userSettingsRepository.findByAccountId(accountId);

    if (!settings) {
      // Create settings if they don't exist
      settings = UserSettings.create({
        id: UserSettingsId.generate(),
        accountId,
      });
    }

    if (input.fiatCurrency !== undefined) {
      const currency = FiatCurrency.of(input.fiatCurrency);
      settings.setFiatCurrency(currency);
    }

    if (input.language !== undefined) {
      const language = Language.of(input.language);
      settings.setLanguage(language);
    }

    await this.deps.userSettingsRepository.save(settings);

    return {settings};
  }
}
