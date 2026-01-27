import {Injectable, OnDestroy, signal} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {Amount, ConversionRates, Currency} from "../model";

const REFRESH_INTERVAL_MS = 60_000;

@Injectable({providedIn: 'root'})
export class CurrencyService implements OnDestroy {
  private readonly _rates = signal<ConversionRates>({BTC_USD: 100});
  private readonly _currencies = signal<Currency[]>(['USD', 'SAT', 'BTC']);
  private refreshInterval: ReturnType<typeof setInterval> | null = null;

  readonly currencies = this._currencies.asReadonly();
  readonly rates = this._rates.asReadonly();

  constructor(
    private readonly http: HttpClient
  ) {
    this.fetchRates();
    this.startAutoRefresh();
  }

  convert(amount: Amount, targetCurrency: Currency): Amount {
    return amount.convert(targetCurrency, this._rates());
  }

  fetchRates(): void {
    this.http.get<ConversionRates>('/api/prices').subscribe({
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
