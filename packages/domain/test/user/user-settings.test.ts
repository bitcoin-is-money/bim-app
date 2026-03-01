import {AccountId} from '@bim/domain/account';
import {FiatCurrency} from '@bim/domain/currency';
import {Language, UserSettings, UserSettingsId} from '@bim/domain/user';
import {describe, expect, it} from 'vitest';

describe('UserSettings', () => {
  const accountId = AccountId.of('550e8400-e29b-41d4-a716-446655440000');
  const settingsId = UserSettingsId.of('660e8400-e29b-41d4-a716-446655440001');

  describe('create', () => {
    it('creates settings with default values', () => {
      const settings = UserSettings.create({
        id: settingsId,
        accountId,
      });

      expect(settings.id).toBe(settingsId);
      expect(settings.accountId).toBe(accountId);
      expect(settings.getPreferredCurrencies()).toEqual([FiatCurrency.DEFAULT]);
      expect(settings.getDefaultCurrency()).toBe(FiatCurrency.DEFAULT);
      expect(settings.getLanguage()).toBe(Language.DEFAULT);
    });

    it('sets createdAt and updatedAt to current time', () => {
      const before = new Date();
      const settings = UserSettings.create({id: settingsId, accountId});
      const after = new Date();

      expect(settings.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(settings.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
      expect(settings.getUpdatedAt().getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });

  describe('fromData', () => {
    it('reconstitutes settings from persisted data', () => {
      const data = {
        id: settingsId,
        accountId,
        preferredCurrencies: [FiatCurrency.of('EUR'), FiatCurrency.of('GBP')],
        defaultCurrency: FiatCurrency.of('EUR'),
        language: Language.of('fr'),
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
      };

      const settings = UserSettings.fromData(data);

      expect(settings.id).toBe(settingsId);
      expect(settings.accountId).toBe(accountId);
      expect(settings.getPreferredCurrencies()).toEqual(['EUR', 'GBP']);
      expect(settings.getDefaultCurrency()).toBe('EUR');
      expect(settings.getLanguage()).toBe('fr');
      expect(settings.createdAt).toEqual(data.createdAt);
      expect(settings.getUpdatedAt()).toEqual(data.updatedAt);
    });
  });

  describe('setPreferredCurrencies', () => {
    it('updates preferred currencies', () => {
      const settings = UserSettings.create({id: settingsId, accountId});

      settings.setPreferredCurrencies([FiatCurrency.of('EUR'), FiatCurrency.of('GBP')]);

      expect(settings.getPreferredCurrencies()).toEqual(['EUR', 'GBP']);
    });

    it('resets defaultCurrency if not in new list', () => {
      const settings = UserSettings.create({id: settingsId, accountId});
      // Default is USD
      settings.setPreferredCurrencies([FiatCurrency.of('EUR'), FiatCurrency.of('GBP')]);

      expect(settings.getDefaultCurrency()).toBe('EUR'); // First in new list
    });

    it('keeps defaultCurrency if still in new list', () => {
      const settings = UserSettings.create({id: settingsId, accountId});
      settings.setPreferredCurrencies([FiatCurrency.of('EUR'), FiatCurrency.of('USD')]);

      expect(settings.getDefaultCurrency()).toBe('USD'); // Still in list
    });

    it('throws on empty list', () => {
      const settings = UserSettings.create({id: settingsId, accountId});

      expect(() => settings.setPreferredCurrencies([])).toThrow('At least one preferred currency is required');
    });

    it('updates updatedAt timestamp', () => {
      const settings = UserSettings.create({id: settingsId, accountId});
      const initialUpdatedAt = settings.getUpdatedAt();

      settings.setPreferredCurrencies([FiatCurrency.of('EUR')]);

      expect(settings.getUpdatedAt().getTime()).toBeGreaterThanOrEqual(initialUpdatedAt.getTime());
    });
  });

  describe('setDefaultCurrency', () => {
    it('updates default currency', () => {
      const settings = UserSettings.create({id: settingsId, accountId});
      settings.setPreferredCurrencies([FiatCurrency.of('USD'), FiatCurrency.of('EUR')]);

      settings.setDefaultCurrency(FiatCurrency.of('EUR'));

      expect(settings.getDefaultCurrency()).toBe('EUR');
    });

    it('throws if currency not in preferred list', () => {
      const settings = UserSettings.create({id: settingsId, accountId});

      expect(() => settings.setDefaultCurrency(FiatCurrency.of('EUR')))
        .toThrow('Default currency EUR must be in preferred currencies');
    });
  });

  describe('setLanguage', () => {
    it('updates language', () => {
      const settings = UserSettings.create({id: settingsId, accountId});
      const fr = Language.of('fr');

      settings.setLanguage(fr);

      expect(settings.getLanguage()).toBe('fr');
    });

    it('updates updatedAt timestamp', () => {
      const settings = UserSettings.create({id: settingsId, accountId});
      const initialUpdatedAt = settings.getUpdatedAt();

      const fr = Language.of('fr');
      settings.setLanguage(fr);

      expect(settings.getUpdatedAt().getTime()).toBeGreaterThanOrEqual(initialUpdatedAt.getTime());
    });
  });

  describe('toData', () => {
    it('exports all settings data', () => {
      const settings = UserSettings.create({id: settingsId, accountId});
      settings.setPreferredCurrencies([FiatCurrency.of('GBP'), FiatCurrency.of('EUR')]);
      settings.setDefaultCurrency(FiatCurrency.of('EUR'));
      settings.setLanguage(Language.of('fr'));

      const data = settings.toData();

      expect(data.id).toBe(settingsId);
      expect(data.accountId).toBe(accountId);
      expect(data.preferredCurrencies).toEqual(['GBP', 'EUR']);
      expect(data.defaultCurrency).toBe('EUR');
      expect(data.language).toBe('fr');
      expect(data.createdAt).toEqual(settings.createdAt);
      expect(data.updatedAt).toEqual(settings.getUpdatedAt());
    });
  });
});
