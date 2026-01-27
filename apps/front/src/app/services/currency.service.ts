import {Injectable, OnDestroy, signal} from '@angular/core';
import {Amount, ConversionRates, Currency} from "../model";
import {CurrencyHttpService} from './currency.http.service';

const REFRESH_INTERVAL_MS = 60_000;

@Injectable({providedIn: 'root'})
export class CurrencyService implements OnDestroy {
  private readonly _rates = signal<ConversionRates>({BTC_USD: 100});
  private readonly _currencies = signal<Currency[]>(['USD', 'SAT', 'BTC']);
  private refreshInterval: ReturnType<typeof setInterval> | null = null;

  readonly currencies = this._currencies.asReadonly();
  readonly rates = this._rates.asReadonly();

  constructor(
    private readonly httpService: CurrencyHttpService
  ) {
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
