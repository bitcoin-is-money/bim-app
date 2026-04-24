import {AccountId} from '../../account';
import type {UserSettingsRepository} from '../../ports';
import {UserSettingsId} from '../types';
import type {
  FetchSettingsUseCase,
  FetchUserSettingsInput,
  FetchUserSettingsOutput,
} from '../use-cases/fetch-settings.use-case';
import {UserSettings} from '../user-settings';

export interface UserSettingsReaderDeps {
  userSettingsRepository: UserSettingsRepository;
}

/**
 * Fetches user settings for an account. Creates default settings on first
 * read when none exist yet (so callers never receive undefined).
 */
export class UserSettingsReader implements FetchSettingsUseCase {
  constructor(private readonly deps: UserSettingsReaderDeps) {}

  async fetch(input: FetchUserSettingsInput): Promise<FetchUserSettingsOutput> {
    const accountId = AccountId.of(input.accountId);

    let settings = await this.deps.userSettingsRepository
      .findByAccountId(accountId);

    if (!settings) {
      settings = UserSettings.create({
        id: UserSettingsId.generate(),
        accountId,
      });
      await this.deps.userSettingsRepository.save(settings);
    }

    return {settings};
  }
}
