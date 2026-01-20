import {HttpClient} from '@angular/common/http';
import {Injectable} from '@angular/core';
import {Observable} from 'rxjs';

export interface Balance {
  amount: number;
  currency: 'USD' | 'BTC';
}

@Injectable({
  providedIn: 'root',
})
export class BalanceService {
  private readonly apiUrl = '/api/balance';

  constructor(private http: HttpClient) {}

  getBalance(): Observable<Balance> {
    return this.http.get<Balance>(this.apiUrl);
  }
}
