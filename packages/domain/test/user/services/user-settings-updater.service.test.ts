import {AccountId} from '@bim/domain/account';
import {FiatCurrency} from '@bim/domain/currency';
import type {UserSettingsRepository} from '@bim/domain/ports';
import {Language, UserSettings, UserSettingsId, UserSettingsUpdater} from '@bim/domain/user';
import {beforeEach, describe, expect, it, vi} from 'vitest';

describe('UserSettingsUpdater', () => {
  const accountId = AccountId.of('550e8400-e29b-41d4-a716-446655440000');
  const settingsId = UserSettingsId.of('660e8400-e29b-41d4-a716-446655440001');

  let mockRepository: UserSettingsRepository;
  let service: UserSettingsUpdater;

  beforeEach(() => {
    mockRepository = {
      save: vi.fn(),
      findByAccountId: vi.fn(),
    };
    service = new UserSettingsUpdater({
      userSettingsRepository: mockRepository,
    });
  });

  it('updates preferred currencies', async () => {
    const settings = UserSettings.create({id: settingsId, accountId});
    vi.mocked(mockRepository.findByAccountId).mockResolvedValue(settings);

    const result = await service.update({
      accountId,
      preferredCurrencies: [FiatCurrency.of('EUR'), FiatCurrency.of('GBP')],
    });

    expect(result.settings.getPreferredCurrencies()).toEqual(['EUR', 'GBP']);
    expect(mockRepository.save).toHaveBeenCalled();
  });

  it('updates default currency', async () => {
    const settings = UserSettings.create({id: settingsId, accountId});
    settings.setPreferredCurrencies([FiatCurrency.of('USD'), FiatCurrency.of('EUR')]);
    vi.mocked(mockRepository.findByAccountId).mockResolvedValue(settings);

    const result = await service.update({
      accountId,
      defaultCurrency: FiatCurrency.of('EUR'),
    });

    expect(result.settings.getDefaultCurrency()).toBe('EUR');
    expect(mockRepository.save).toHaveBeenCalled();
  });

  it('updates language', async () => {
    const settings = UserSettings.create({id: settingsId, accountId});
    vi.mocked(mockRepository.findByAccountId).mockResolvedValue(settings);

    const result = await service.update({
      accountId,
      language: Language.of('fr'),
    });

    expect(result.settings.getLanguage()).toBe('fr');
    expect(mockRepository.save).toHaveBeenCalled();
  });

  it('creates settings if none exist', async () => {
    vi.mocked(mockRepository.findByAccountId).mockResolvedValue(undefined);

    const result = await service.update({
      accountId,
      preferredCurrencies: [FiatCurrency.of('EUR')],
      language: Language.of('fr'),
    });

    expect(result.settings.getPreferredCurrencies()).toEqual(['EUR']);
    expect(result.settings.getLanguage()).toBe('fr');
    expect(mockRepository.save).toHaveBeenCalled();
  });
});
