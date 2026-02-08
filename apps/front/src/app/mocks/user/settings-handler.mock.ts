import {HttpResponse} from '@angular/common/http';
import type {UserSettings} from '../../model/user-settings';
import type {DataStoreMock, StoredUserSettings} from '../data-store.mock';

const SUPPORTED_LANGUAGES = ['en', 'fr'] as const;
const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD'] as const;

export class SettingsHandlerMock {
  constructor(private readonly store: DataStoreMock) {}

  getSettings(): HttpResponse<UserSettings> {
    const storedSettings = this.store.getUserSettings();
    const settings: UserSettings = {
      ...storedSettings,
      supportedLanguages: SUPPORTED_LANGUAGES,
      supportedCurrencies: SUPPORTED_CURRENCIES,
    };
    return new HttpResponse({
      status: 200,
      body: settings,
    });
  }

  updateSettings(body: Partial<StoredUserSettings>): HttpResponse<UserSettings> {
    const current = this.store.getUserSettings();
    const updated: StoredUserSettings = {
      ...current,
      ...(body.language !== undefined && {language: body.language}),
      ...(body.fiatCurrency !== undefined && {fiatCurrency: body.fiatCurrency}),
    };
    this.store.setUserSettings(updated);
    const settings: UserSettings = {
      ...updated,
      supportedLanguages: SUPPORTED_LANGUAGES,
      supportedCurrencies: SUPPORTED_CURRENCIES,
    };
    return new HttpResponse({
      status: 200,
      body: settings,
    });
  }
}
