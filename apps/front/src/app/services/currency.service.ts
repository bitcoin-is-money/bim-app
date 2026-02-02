import {inject, Injectable, OnDestroy, signal} from '@angular/core';
import {Amount, ConversionRates, Currency} from "../model";
import {CurrencyHttpService} from './currency.http.service';

const REFRESH_INTERVAL_MS = 60_000;

@Injectable({providedIn: 'root'})
export class CurrencyService implements OnDestroy {
  private readonly httpService: CurrencyHttpService = inject(CurrencyHttpService);
  private readonly _rates = signal<ConversionRates>({BTC_USD: 100});
  private readonly _defaultCurrency = signal<Currency>('BTC');
  private readonly _currentCurrency = signal<Currency>(this._defaultCurrency());
  private readonly _preferredCurrencies = signal<Currency[]>(['BTC', 'SAT', 'USD']);
  private refreshInterval: ReturnType<typeof setInterval> | null = null;

  readonly availableCurrencies: readonly Currency[] = ['BTC', 'SAT', 'USD'];
  readonly defaultCurrency = this._defaultCurrency.asReadonly();
  readonly currentCurrency = this._currentCurrency.asReadonly();
  readonly preferredCurrencies = this._preferredCurrencies.asReadonly();
  readonly rates = this._rates.asReadonly();

  setCurrentCurrency(currency: Currency): void {
    this._currentCurrency.set(currency);
  }

  cycleCurrentCurrency(): void {
    const currencies = this._preferredCurrencies();
    const currentIndex = currencies.indexOf(this._currentCurrency());
    const nextIndex = (currentIndex + 1) % currencies.length;
    this._currentCurrency.set(currencies[nextIndex] as Currency);
  }

  constructor() {
    this.fetchRates();
    this.startAutoRefresh();
  }

  convert(amount: Amount, targetCurrency: Currency): Amount {
    return amount.convert(targetCurrency, this._rates());
  }

  fetchRates(): void {
    this.httpService.fetchRates().subscribe({
      next: (rates) => this._rates.set(rates)
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
