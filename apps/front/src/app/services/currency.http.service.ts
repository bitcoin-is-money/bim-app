import {HttpClient} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import {Observable} from 'rxjs';
import {ConversionRates} from '../model';

@Injectable({
  providedIn: 'root',
})
export class CurrencyHttpService {
  private readonly apiUrl = '/api/currency/prices';
  private readonly http = inject(HttpClient);

  fetchRates(): Observable<ConversionRates> {
    return this.http.get<ConversionRates>(this.apiUrl);
  }
}
