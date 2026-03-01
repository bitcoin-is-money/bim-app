import {HttpClient} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import {Observable} from 'rxjs';
import {UserSettings} from '../model/user-settings';

export interface PricesResponse {
  prices: Record<string, number>;
  supportedCurrencies: string[];
}

@Injectable({
  providedIn: 'root',
})
export class CurrencyHttpService {
  private readonly http = inject(HttpClient);

  getSettings(): Observable<UserSettings> {
    return this.http.get<UserSettings>('/api/user/settings');
  }

  fetchRates(): Observable<PricesResponse> {
    return this.http.get<PricesResponse>('/api/currency/prices');
  }
}
