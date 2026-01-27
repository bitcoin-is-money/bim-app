import {Injectable} from '@angular/core';
import {map, Observable} from 'rxjs';
import {Amount} from '../model';
import {BalanceHttpService} from './balance.http.service';

@Injectable({
  providedIn: 'root',
})
export class BalanceService {
  constructor(
    private readonly httpService: BalanceHttpService
  ) {}

  getBalance(): Observable<Amount> {
    return this.httpService.getBalance().pipe(
      map((response) => Amount.of(response.amount, response.currency))
    );
  }
}
