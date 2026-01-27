import {AccountId} from '@bim/domain/account';
import type {UserSettingsRepository} from '@bim/domain/ports';
import {
  FiatCurrency,
  getFetchUserSettingsService,
  getUpdateUserSettingsService,
  UnsupportedCurrencyError,
  UserSettings,
  UserSettingsId
} from '@bim/domain/user';
import {beforeEach, describe, expect, it, vi} from 'vitest';

describe('UserSettings Services', () => {
  const accountId = AccountId.of('550e8400-e29b-41d4-a716-446655440000');
  const settingsId = UserSettingsId.of('660e8400-e29b-41d4-a716-446655440001');

  let mockRepository: UserSettingsRepository;
  let idGenerator: () => UserSettingsId;

  beforeEach(() => {
    mockRepository = {
      save: vi.fn(),
      findByAccountId: vi.fn(),
    };
    idGenerator = () => settingsId;
  });

  describe('getFetchUserSettingsService', () => {
    it('returns existing settings', async () => {
      const existingSettings = UserSettings.create({id: settingsId, accountId});
      existingSettings.setFiatCurrency(FiatCurrency.of('EUR'));
      vi.mocked(mockRepository.findByAccountId).mockResolvedValue(existingSettings);

      const useCase = getFetchUserSettingsService({
        userSettingsRepository: mockRepository,
        idGenerator,
      });
      const result = await useCase({accountId: accountId});

      expect(result.settings.getFiatCurrency()).toBe('EUR');
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('creates default settings if none exist', async () => {
      vi.mocked(mockRepository.findByAccountId).mockResolvedValue(undefined);

      const useCase = getFetchUserSettingsService({
        userSettingsRepository: mockRepository,
        idGenerator,
      });
      const result = await useCase({accountId: accountId});

      expect(result.settings.getFiatCurrency()).toBe(FiatCurrency.DEFAULT);
      expect(mockRepository.save).toHaveBeenCalled();
    });
  });

  describe('getUpdateUserSettingsService', () => {
    it('updates fiat currency on existing settings', async () => {
      const existingSettings = UserSettings.create({id: settingsId, accountId});
      vi.mocked(mockRepository.findByAccountId).mockResolvedValue(existingSettings);

      const useCase = getUpdateUserSettingsService({
        userSettingsRepository: mockRepository,
        idGenerator,
      });
      const result = await useCase({
        accountId: accountId,
        fiatCurrency: 'GBP',
      });

      expect(result.settings.getFiatCurrency()).toBe('GBP');
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('creates settings if none exist and updates currency', async () => {
      vi.mocked(mockRepository.findByAccountId).mockResolvedValue(undefined);

      const useCase = getUpdateUserSettingsService({
        userSettingsRepository: mockRepository,
        idGenerator,
      });
      const result = await useCase({
        accountId: accountId,
        fiatCurrency: 'CHF',
      });

      expect(result.settings.getFiatCurrency()).toBe('CHF');
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('throws for unsupported currency', async () => {
      const existingSettings = UserSettings.create({id: settingsId, accountId});
      vi.mocked(mockRepository.findByAccountId).mockResolvedValue(existingSettings);

      const useCase = getUpdateUserSettingsService({
        userSettingsRepository: mockRepository,
        idGenerator,
      });

      expect(
        useCase({accountId: accountId, fiatCurrency: 'XYZ'}),
      ).rejects.toThrow(UnsupportedCurrencyError);
    });

    it('does not modify settings if no fiatCurrency provided', async () => {
      const existingSettings = UserSettings.create({id: settingsId, accountId});
      existingSettings.setFiatCurrency(FiatCurrency.of('EUR'));
      vi.mocked(mockRepository.findByAccountId).mockResolvedValue(existingSettings);

      const useCase = getUpdateUserSettingsService({
        userSettingsRepository: mockRepository,
        idGenerator,
      });
      const result = await useCase({accountId: accountId});

      expect(result.settings.getFiatCurrency()).toBe('EUR');
    });
  });
});
