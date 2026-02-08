import {AccountId} from '@bim/domain/account';
import type {UserSettingsRepository} from '@bim/domain/ports';
import {
  FiatCurrency,
  Language,
  UnsupportedCurrencyError,
  UnsupportedLanguageError,
  UserSettings,
  UserSettingsId,
  UserSettingsService,
} from '@bim/domain/user';
import {beforeEach, describe, expect, it, vi} from 'vitest';

describe('UserSettingsService', () => {
  const accountId = AccountId.of('550e8400-e29b-41d4-a716-446655440000');
  const settingsId = UserSettingsId.of('660e8400-e29b-41d4-a716-446655440001');

  let mockRepository: UserSettingsRepository;
  let service: UserSettingsService;

  beforeEach(() => {
    mockRepository = {
      save: vi.fn(),
      findByAccountId: vi.fn(),
    };
    service = new UserSettingsService({
      userSettingsRepository: mockRepository,
    });
  });

  describe('fetch', () => {
    it('returns existing settings', async () => {
      const settings = UserSettings.fromData({
        id: settingsId,
        accountId,
        fiatCurrency: FiatCurrency.of('EUR'),
        language: Language.of('fr'),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.mocked(mockRepository.findByAccountId).mockResolvedValue(settings);

      const result = await service.fetch({accountId: accountId});

      expect(result.settings.getFiatCurrency()).toBe('EUR');
      expect(result.settings.getLanguage()).toBe('fr');
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('creates default settings if none exist', async () => {
      vi.mocked(mockRepository.findByAccountId).mockResolvedValue(undefined);

      const result = await service.fetch({accountId: accountId});

      expect(result.settings.getFiatCurrency()).toBe('USD'); // Default
      expect(result.settings.getLanguage()).toBe('en'); // Default
      expect(mockRepository.save).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('updates existing settings', async () => {
      const settings = UserSettings.create({
        id: settingsId,
        accountId,
      });
      vi.mocked(mockRepository.findByAccountId).mockResolvedValue(settings);

      const result = await service.update({
        accountId: accountId,
        fiatCurrency: 'EUR',
        language: 'fr',
      });

      expect(result.settings.getFiatCurrency()).toBe('EUR');
      expect(result.settings.getLanguage()).toBe('fr');
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('creates settings if none exist', async () => {
      vi.mocked(mockRepository.findByAccountId).mockResolvedValue(undefined);

      const result = await service.update({
        accountId: accountId,
        fiatCurrency: 'EUR',
        language: 'fr',
      });

      expect(result.settings.getFiatCurrency()).toBe('EUR');
      expect(result.settings.getLanguage()).toBe('fr');
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('throws for unsupported currency', async () => {
      const settings = UserSettings.create({
        id: settingsId,
        accountId,
      });
      vi.mocked(mockRepository.findByAccountId).mockResolvedValue(settings);

      await expect(
        service.update({
          accountId: accountId,
          fiatCurrency: 'INVALID',
        }),
      ).rejects.toThrow(UnsupportedCurrencyError);
    });

    it('throws for unsupported language', async () => {
      const settings = UserSettings.create({
        id: settingsId,
        accountId,
      });
      vi.mocked(mockRepository.findByAccountId).mockResolvedValue(settings);

      await expect(
        service.update({
          accountId: accountId,
          language: 'de',
        }),
      ).rejects.toThrow(UnsupportedLanguageError);
    });
  });
});
