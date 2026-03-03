import type { OnDestroy} from '@angular/core';
import {inject, Injectable, signal} from '@angular/core';
import {firstValueFrom} from 'rxjs';
import type {Amount, ConversionRates, Currency} from "../model";
import {CurrencyHttpService} from './currency.http.service';
import {UserSettingsHttpService} from './user-settings-http.service';

const REFRESH_INTERVAL_MS = 6 * 3600 * 1000; // 6 hours

@Injectable({providedIn: 'root'})
export class CurrencyService implements OnDestroy {
  private readonly currencyHttp = inject(CurrencyHttpService);
  private readonly settingsHttp = inject(UserSettingsHttpService);
  private readonly _rates = signal<ConversionRates>({prices: {}});
  private readonly _defaultCurrency = signal<Currency>('BTC');
  private readonly _currentCurrency = signal<Currency>(this._defaultCurrency());
  private readonly _preferredCurrencies = signal<Currency[]>(['BTC', 'SAT', 'USD']);
  private readonly _supportedCurrencies = signal<readonly string[]>([]);
  private refreshInterval: ReturnType<typeof setInterval> | null = null;

  readonly defaultCurrency = this._defaultCurrency.asReadonly();
  readonly currentCurrency = this._currentCurrency.asReadonly();
  readonly preferredCurrencies = this._preferredCurrencies.asReadonly();
  readonly supportedCurrencies = this._supportedCurrencies.asReadonly();
  readonly rates = this._rates.asReadonly();

  constructor() {
    // Rates and auto-refresh are started in init(), called after authentication
  }

  setCurrentCurrency(currency: Currency): void {
    this._currentCurrency.set(currency);
  }

  cycleCurrentCurrency(): void {
    const currencies = this._preferredCurrencies();
    const currentIndex = currencies.indexOf(this._currentCurrency());
    const nextIndex = (currentIndex + 1) % currencies.length;
    // eslint-disable-next-line security/detect-object-injection -- numeric index
    this._currentCurrency.set(currencies[nextIndex] ?? this._currentCurrency());
  }

  /**
   * Initialize currency preferences from user settings.
   * Call this after the user is authenticated.
   */
  async init(): Promise<void> {
    try {
      const settings = await firstValueFrom(this.settingsHttp.getSettings());
      this.updatePreferredCurrencies(settings.preferredCurrencies);
      this._defaultCurrency.set(settings.defaultCurrency);
      this._currentCurrency.set(settings.defaultCurrency);
    } catch {
      console.warn('Failed to load currency preferences');
    }
    this.fetchRates();
    this.startAutoRefresh();
  }

  /**
   * Change the preferred fiat currency and persist to server.
   */
  async setPreferredFiat(fiat: string): Promise<void> {
    this.updatePreferredCurrencies([fiat]);
    try {
      await firstValueFrom(this.settingsHttp.updateSettings({
        preferredCurrencies: [fiat],
        defaultCurrency: fiat,
      }));
    } catch {
      console.warn('Failed to persist currency preference');
    }
  }

  convert(amount: Amount, targetCurrency: Currency): Amount {
    return amount.convert(targetCurrency, this._rates());
  }

  fetchRates(): void {
    this.currencyHttp.fetchRates().subscribe({
      next: (prices) => {
        this._rates.set({prices});
        this._supportedCurrencies.set(Object.keys(prices).sort());
      }
    });
  }

  ngOnDestroy(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }

  private updatePreferredCurrencies(fiats: string[]): void {
    this._preferredCurrencies.set(['BTC', ...fiats, 'SAT']);
  }

  private startAutoRefresh(): void {
    this.refreshInterval = setInterval(() => {
      this.fetchRates();
    }, REFRESH_INTERVAL_MS);
  }

}
