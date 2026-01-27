import {HttpClient} from '@angular/common/http';
import {Injectable} from '@angular/core';
import {map, Observable} from 'rxjs';
import {Amount, Currency} from '../model';

interface BalanceResponse {
  amount: number;
  currency: Currency;
}

@Injectable({
  providedIn: 'root',
})
export class BalanceService {
  private readonly apiUrl = '/api/balance';

  constructor(
    private readonly http: HttpClient
  ) {}

  getBalance(): Observable<Amount> {
    return this.http.get<BalanceResponse>(this.apiUrl).pipe(
      map((response) => Amount.of(response.amount, response.currency))
    );
  }
}
