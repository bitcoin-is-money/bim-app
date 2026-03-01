import {HttpResponse} from '@angular/common/http';
import type {UserSettings} from '../../model/user-settings';
import type {DataStoreMock, StoredUserSettings} from '../data-store.mock';

export class SettingsHandlerMock {
  constructor(private readonly store: DataStoreMock) {}

  getSettings(): HttpResponse<UserSettings> {
    return new HttpResponse({
      status: 200,
      body: this.store.getUserSettings(),
    });
  }

  updateSettings(body: Partial<StoredUserSettings>): HttpResponse<UserSettings> {
    const current = this.store.getUserSettings();
    const updated: StoredUserSettings = {
      ...current,
      ...(body.language !== undefined && {language: body.language}),
      ...(body.preferredCurrencies !== undefined && {preferredCurrencies: body.preferredCurrencies}),
      ...(body.defaultCurrency !== undefined && {defaultCurrency: body.defaultCurrency}),
    };
    this.store.setUserSettings(updated);
    return new HttpResponse({
      status: 200,
      body: updated,
    });
  }
}
