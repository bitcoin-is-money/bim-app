import {AccountId} from '@bim/domain/account';
import type {UserSettingsRepository} from '@bim/domain/ports';
import {
  FiatCurrency,
  UnsupportedCurrencyError,
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
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.mocked(mockRepository.findByAccountId).mockResolvedValue(settings);

      const result = await service.fetch({accountId: accountId});

      expect(result.settings.getFiatCurrency()).toBe('EUR');
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('creates default settings if none exist', async () => {
      vi.mocked(mockRepository.findByAccountId).mockResolvedValue(undefined);

      const result = await service.fetch({accountId: accountId});

      expect(result.settings.getFiatCurrency()).toBe('USD'); // Default
      expect(mockRepository.save).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('updates existing settings', async () => {
      const settings = UserSettings.create({
        id: settingsId,
        accountId,
        fiatCurrency: FiatCurrency.of('USD'),
      });
      vi.mocked(mockRepository.findByAccountId).mockResolvedValue(settings);

      const result = await service.update({
        accountId: accountId,
        fiatCurrency: 'EUR',
      });

      expect(result.settings.getFiatCurrency()).toBe('EUR');
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('creates settings if none exist', async () => {
      vi.mocked(mockRepository.findByAccountId).mockResolvedValue(undefined);

      const result = await service.update({
        accountId: accountId,
        fiatCurrency: 'EUR',
      });

      expect(result.settings.getFiatCurrency()).toBe('EUR');
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
  });
});
