import {Injectable} from '@angular/core';
import {Observable} from 'rxjs';
import {Transaction, TransactionHttpService} from './transaction.http.service';

export type {Transaction} from './transaction.http.service';

@Injectable({
  providedIn: 'root',
})
export class TransactionService {
  constructor(private readonly httpService: TransactionHttpService) {}

  getTransactions(): Observable<Transaction[]> {
    return this.httpService.getTransactions();
  }
}
