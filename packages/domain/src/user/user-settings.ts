import {AccountId} from '../account';
import {FiatCurrency} from './fiat-currency';
import {Language} from './language';
import {type UserSettingsData, UserSettingsId} from './types';

/**
 * UserSettings entity representing user preferences.
 */
export class UserSettings {
  private fiatCurrency: FiatCurrency;
  private language: Language;
  private updatedAt: Date;

  private constructor(
    readonly id: UserSettingsId,
    readonly accountId: AccountId,
    readonly createdAt: Date,
    fiatCurrency: FiatCurrency,
    language: Language,
    updatedAt: Date,
  ) {
    this.fiatCurrency = fiatCurrency;
    this.language = language;
    this.updatedAt = updatedAt;
  }

  /**
   * Creates new user settings with default values.
   */
  static create(params: {
    id: UserSettingsId;
    accountId: AccountId;
  }): UserSettings {
    const now = new Date();
    return new UserSettings(
      params.id,
      params.accountId,
      now,
      FiatCurrency.DEFAULT,
      Language.DEFAULT,
      now,
    );
  }

  /**
   * Reconstitutes user settings from persisted data.
   */
  static fromData(data: UserSettingsData): UserSettings {
    return new UserSettings(
      data.id,
      data.accountId,
      data.createdAt,
      data.fiatCurrency,
      data.language,
      data.updatedAt,
    );
  }

  /**
   * Returns the preferred fiat currency.
   */
  getFiatCurrency(): FiatCurrency {
    return this.fiatCurrency;
  }

  /**
   * Returns the preferred language.
   */
  getLanguage(): Language {
    return this.language;
  }

  /**
   * Returns the last update timestamp.
   */
  getUpdatedAt(): Date {
    return this.updatedAt;
  }

  /**
   * Updates the preferred fiat currency.
   */
  setFiatCurrency(currency: FiatCurrency): void {
    this.fiatCurrency = currency;
    this.updatedAt = new Date();
  }

  /**
   * Updates the preferred language.
   */
  setLanguage(language: Language): void {
    this.language = language;
    this.updatedAt = new Date();
  }

  /**
   * Exports the settings data for persistence.
   */
  toData(): UserSettingsData {
    return {
      id: this.id,
      accountId: this.accountId,
      fiatCurrency: this.fiatCurrency,
      language: this.language,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
