import {HttpClient} from '@angular/common/http';
import {Injectable} from '@angular/core';
import {Observable} from 'rxjs';
import {Currency} from '../model';

export interface BalanceResponse {
  amount: number;
  currency: Currency;
}

@Injectable({
  providedIn: 'root',
})
export class BalanceHttpService {
  private readonly apiUrl = '/api/balance';

  constructor(private readonly http: HttpClient) {}

  getBalance(): Observable<BalanceResponse> {
    return this.http.get<BalanceResponse>(this.apiUrl);
  }
}
