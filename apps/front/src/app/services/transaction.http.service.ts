import {HttpClient} from '@angular/common/http';
import {Injectable} from '@angular/core';
import {Observable} from 'rxjs';

export interface Transaction {
  id: string;
  date: string;
  name: string;
  amount: number; // positive for credit, negative for debit
}

@Injectable({
  providedIn: 'root',
})
export class TransactionHttpService {
  private readonly apiUrl = '/api/transactions';

  constructor(private readonly http: HttpClient) {}

  getTransactions(): Observable<Transaction[]> {
    return this.http.get<Transaction[]>(this.apiUrl);
  }
}
