import {AccountId} from '@bim/domain/account';
import {FiatCurrency} from '@bim/domain/currency';
import type {UserSettingsRepository} from '@bim/domain/ports';
import {Language, UserSettings, UserSettingsId, UserSettingsReader} from '@bim/domain/user';
import {beforeEach, describe, expect, it, vi} from 'vitest';

describe('UserSettingsReader', () => {
  const accountId = AccountId.of('550e8400-e29b-41d4-a716-446655440000');
  const settingsId = UserSettingsId.of('660e8400-e29b-41d4-a716-446655440001');

  let mockRepository: UserSettingsRepository;
  let service: UserSettingsReader;

  beforeEach(() => {
    mockRepository = {
      save: vi.fn(),
      findByAccountId: vi.fn(),
    };
    service = new UserSettingsReader({
      userSettingsRepository: mockRepository,
    });
  });

  it('returns existing settings', async () => {
    const settings = new UserSettings(
      settingsId,
      accountId,
      new Date(),
      [FiatCurrency.of('EUR')],
      FiatCurrency.of('EUR'),
      Language.of('fr'),
      new Date(),
    );
    vi.mocked(mockRepository.findByAccountId).mockResolvedValue(settings);

    const result = await service.fetch({accountId});

    expect(result.settings.getPreferredCurrencies()).toEqual(['EUR']);
    expect(result.settings.getDefaultCurrency()).toBe('EUR');
    expect(result.settings.getLanguage()).toBe('fr');
    expect(mockRepository.save).not.toHaveBeenCalled();
  });

  it('creates default settings if none exist', async () => {
    vi.mocked(mockRepository.findByAccountId).mockResolvedValue(undefined);

    const result = await service.fetch({accountId});

    expect(result.settings.getPreferredCurrencies()).toEqual(['USD']);
    expect(result.settings.getDefaultCurrency()).toBe('USD');
    expect(result.settings.getLanguage()).toBe('en');
    expect(mockRepository.save).toHaveBeenCalled();
  });
});
