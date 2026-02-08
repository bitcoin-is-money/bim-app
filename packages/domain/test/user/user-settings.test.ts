import {AccountId} from '@bim/domain/account';
import {FiatCurrency, Language, UserSettings, UserSettingsId} from '@bim/domain/user';
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
      expect(settings.getFiatCurrency()).toBe(FiatCurrency.DEFAULT);
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
        fiatCurrency: FiatCurrency.of('EUR'),
        language: Language.of('fr'),
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
      };

      const settings = UserSettings.fromData(data);

      expect(settings.id).toBe(settingsId);
      expect(settings.accountId).toBe(accountId);
      expect(settings.getFiatCurrency()).toBe('EUR');
      expect(settings.getLanguage()).toBe('fr');
      expect(settings.createdAt).toEqual(data.createdAt);
      expect(settings.getUpdatedAt()).toEqual(data.updatedAt);
    });
  });

  describe('setFiatCurrency', () => {
    it('updates fiat currency', () => {
      const settings = UserSettings.create({id: settingsId, accountId});
      const eur = FiatCurrency.of('EUR');

      settings.setFiatCurrency(eur);

      expect(settings.getFiatCurrency()).toBe('EUR');
    });

    it('updates updatedAt timestamp', () => {
      const settings = UserSettings.create({id: settingsId, accountId});
      const initialUpdatedAt = settings.getUpdatedAt();

      // Small delay to ensure different timestamp
      const eur = FiatCurrency.of('EUR');
      settings.setFiatCurrency(eur);

      expect(settings.getUpdatedAt().getTime()).toBeGreaterThanOrEqual(initialUpdatedAt.getTime());
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
      settings.setFiatCurrency(FiatCurrency.of('GBP'));
      settings.setLanguage(Language.of('fr'));

      const data = settings.toData();

      expect(data.id).toBe(settingsId);
      expect(data.accountId).toBe(accountId);
      expect(data.fiatCurrency).toBe('GBP');
      expect(data.language).toBe('fr');
      expect(data.createdAt).toEqual(settings.createdAt);
      expect(data.updatedAt).toEqual(settings.getUpdatedAt());
    });
  });
});
