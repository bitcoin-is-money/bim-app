import {inject, Injectable, OnDestroy, signal} from '@angular/core';
import {firstValueFrom} from 'rxjs';
import {Amount, ConversionRates, Currency} from "../model";
import {CurrencyHttpService} from './currency.http.service';

const REFRESH_INTERVAL_MS = 6 * 3600 * 1000; // 6 hours

@Injectable({providedIn: 'root'})
export class CurrencyService implements OnDestroy {
  private readonly httpService: CurrencyHttpService = inject(CurrencyHttpService);
  private readonly _rates = signal<ConversionRates>({prices: {}});
  private readonly _defaultCurrency = signal<Currency>('BTC');
  private readonly _currentCurrency = signal<Currency>(this._defaultCurrency());
  private readonly _preferredCurrencies = signal<Currency[]>(['BTC', 'SAT', 'USD']);
  private readonly _availableCurrencies = signal<readonly Currency[]>(['BTC', 'SAT', 'USD']);
  private refreshInterval: ReturnType<typeof setInterval> | null = null;

  readonly defaultCurrency = this._defaultCurrency.asReadonly();
  readonly currentCurrency = this._currentCurrency.asReadonly();
  readonly preferredCurrencies = this._preferredCurrencies.asReadonly();
  readonly rates = this._rates.asReadonly();

  constructor() {
    this.fetchRates();
    this.startAutoRefresh();
  }

  setCurrentCurrency(currency: Currency): void {
    this._currentCurrency.set(currency);
  }

  cycleCurrentCurrency(): void {
    const currencies = this._preferredCurrencies();
    const currentIndex = currencies.indexOf(this._currentCurrency());
    const nextIndex = (currentIndex + 1) % currencies.length;
    this._currentCurrency.set(currencies[nextIndex]!);
  }

  /**
   * Initialize currency preferences from user settings.
   * Call this after the user is authenticated.
   */
  async init(): Promise<void> {
    try {
      const settings = await firstValueFrom(this.httpService.getSettings());
      this._preferredCurrencies.set(settings.preferredCurrencies);
      this._defaultCurrency.set(settings.defaultCurrency);
      this._currentCurrency.set(settings.defaultCurrency);
    } catch {
      console.warn('Failed to load currency preferences');
    }
    this.fetchRates();
  }

  convert(amount: Amount, targetCurrency: Currency): Amount {
    return amount.convert(targetCurrency, this._rates());
  }

  fetchRates(): void {
    this.httpService.fetchRates().subscribe({
      next: (response) => {
        this._rates.set({prices: response.prices});
        this._availableCurrencies.set(['BTC', 'SAT', ...response.supportedCurrencies]);
      }
    });
  }

  ngOnDestroy(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }

  private startAutoRefresh(): void {
    this.refreshInterval = setInterval(() => {
      this.fetchRates();
    }, REFRESH_INTERVAL_MS);
  }

}
