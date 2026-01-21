import {AccountId} from '@bim/domain/account';
import type {UserSettingsRepository} from '@bim/domain/ports';
import {FiatCurrency, UserSettingsId,} from './types';
import {UserSettings} from './user-settings';

// =============================================================================
// Shared Dependencies
// =============================================================================

export interface UserSettingsUseCasesDeps {
  userSettingsRepository: UserSettingsRepository;
  idGenerator: () => UserSettingsId;
}

// =============================================================================
// Fetch User Settings
// =============================================================================

export interface FetchUserSettingsInput {
  accountId: string;
}

export interface FetchUserSettingsOutput {
  settings: UserSettings;
}

export type FetchUserSettingsUseCase = (
  input: FetchUserSettingsInput,
) => Promise<FetchUserSettingsOutput>;

/**
 * Fetches user settings for an account.
 * Creates default settings if none exist.
 */
export function getFetchUserSettingsUseCase(
  deps: UserSettingsUseCasesDeps,
): FetchUserSettingsUseCase {
  return async (input: FetchUserSettingsInput): Promise<FetchUserSettingsOutput> => {
    const accountId = AccountId.of(input.accountId);

    let settings = await deps.userSettingsRepository.findByAccountId(accountId);

    if (!settings) {
      // Create default settings
      settings = UserSettings.create({
        id: deps.idGenerator(),
        accountId,
      });
      await deps.userSettingsRepository.save(settings);
    }

    return {settings};
  };
}

// =============================================================================
// Update User Settings
// =============================================================================

export interface UpdateUserSettingsInput {
  accountId: string;
  fiatCurrency?: string;
}

export interface UpdateUserSettingsOutput {
  settings: UserSettings;
}

export type UpdateUserSettingsUseCase = (
  input: UpdateUserSettingsInput,
) => Promise<UpdateUserSettingsOutput>;

/**
 * Updates user settings for an account.
 */
export function getUpdateUserSettingsUseCase(
  deps: UserSettingsUseCasesDeps,
): UpdateUserSettingsUseCase {
  return async (input: UpdateUserSettingsInput): Promise<UpdateUserSettingsOutput> => {
    const accountId = AccountId.of(input.accountId);

    let settings = await deps.userSettingsRepository.findByAccountId(accountId);

    if (!settings) {
      // Create settings if they don't exist
      settings = UserSettings.create({
        id: deps.idGenerator(),
        accountId,
      });
    }

    if (input.fiatCurrency !== undefined) {
      const currency = FiatCurrency.of(input.fiatCurrency);
      settings.setFiatCurrency(currency);
    }

    await deps.userSettingsRepository.save(settings);

    return {settings};
  };
}
