import type {AccountId} from '../account';
import {FiatCurrency} from '../currency';
import {Language} from './language';
import type {UserSettingsId} from './types';

/**
 * UserSettings entity representing user preferences.
 */
export class UserSettings {
  private preferredCurrencies: FiatCurrency[];
  private defaultCurrency: FiatCurrency;
  private language: Language;
  private updatedAt: Date;

  constructor(
    readonly id: UserSettingsId,
    readonly accountId: AccountId,
    readonly createdAt: Date,
    preferredCurrencies: FiatCurrency[],
    defaultCurrency: FiatCurrency,
    language: Language,
    updatedAt: Date,
  ) {
    this.preferredCurrencies = preferredCurrencies;
    this.defaultCurrency = defaultCurrency;
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
      [FiatCurrency.DEFAULT],
      FiatCurrency.DEFAULT,
      Language.DEFAULT,
      now,
    );
  }

  /**
   * Returns the preferred fiat currencies.
   */
  getPreferredCurrencies(): FiatCurrency[] {
    return [...this.preferredCurrencies];
  }

  /**
   * Returns the default fiat currency for display.
   */
  getDefaultCurrency(): FiatCurrency {
    return this.defaultCurrency;
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
   * Updates the preferred fiat currencies.
   * All currencies must be supported, and at least one is required.
   * If the current defaultCurrency is not in the new list, it is set to the first element.
   */
  setPreferredCurrencies(currencies: FiatCurrency[]): void {
    if (currencies.length === 0) {
      throw new Error('At least one preferred currency is required');
    }
    this.preferredCurrencies = [...currencies];
    if (!this.preferredCurrencies.includes(this.defaultCurrency)) {
      this.defaultCurrency = this.preferredCurrencies[0]!;
    }
    this.updatedAt = new Date();
  }

  /**
   * Updates the default fiat currency. Must be one of the preferred currencies.
   */
  setDefaultCurrency(currency: FiatCurrency): void {
    if (!this.preferredCurrencies.includes(currency)) {
      throw new Error(`Default currency ${currency} must be in preferred currencies`);
    }
    this.defaultCurrency = currency;
    this.updatedAt = new Date();
  }

  /**
   * Updates the preferred language.
   */
  setLanguage(language: Language): void {
    this.language = language;
    this.updatedAt = new Date();
  }

}
