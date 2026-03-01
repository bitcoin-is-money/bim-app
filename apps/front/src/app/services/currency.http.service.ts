import {HttpClient} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import type {Observable} from 'rxjs';

/** BTC prices keyed by fiat currency code. Keys also serve as supported currencies list. */
export type PricesResponse = Record<string, number>;

@Injectable({
  providedIn: 'root',
})
export class CurrencyHttpService {
  private readonly http = inject(HttpClient);

  fetchRates(): Observable<PricesResponse> {
    return this.http.get<PricesResponse>('/api/currency/prices');
  }
}
