import {AccountId} from '../../account';
import type {UserSettingsRepository} from '../../ports';
import {UserSettingsId} from '../types';
import type {
  UpdateSettingsUseCase,
  UpdateUserSettingsInput,
  UpdateUserSettingsOutput,
} from '../use-cases/update-settings.use-case';
import {UserSettings} from '../user-settings';

export interface UserSettingsUpdaterDeps {
  userSettingsRepository: UserSettingsRepository;
}

/**
 * Updates user settings for an account. Creates settings on the fly if
 * none exist yet (first-update bootstrap).
 */
export class UserSettingsUpdater implements UpdateSettingsUseCase {
  constructor(private readonly deps: UserSettingsUpdaterDeps) {}

  async update(input: UpdateUserSettingsInput): Promise<UpdateUserSettingsOutput> {
    const accountId = AccountId.of(input.accountId);

    let settings = await this.deps.userSettingsRepository
      .findByAccountId(accountId);

    settings ??= UserSettings.create({
      id: UserSettingsId.generate(),
      accountId,
    });

    if (input.preferredCurrencies !== undefined) {
      settings.setPreferredCurrencies(input.preferredCurrencies);
    }

    if (input.defaultCurrency !== undefined) {
      settings.setDefaultCurrency(input.defaultCurrency);
    }

    if (input.language !== undefined) {
      settings.setLanguage(input.language);
    }

    await this.deps.userSettingsRepository.save(settings);

    return {settings};
  }
}
