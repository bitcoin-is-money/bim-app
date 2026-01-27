import {HttpClient, HttpParams} from '@angular/common/http';
import {Injectable} from '@angular/core';
import {Observable} from 'rxjs';

export interface Transaction {
  id: string;
  date: string;
  name: string;
  amount: number; // positive for credit, negative for debit
}

export interface PaginatedTransactions {
  transactions: Transaction[];
  total: number;
  limit: number;
  offset: number;
}

@Injectable({
  providedIn: 'root',
})
export class TransactionHttpService {
  private readonly apiUrl = '/api/transactions';

  constructor(private readonly http: HttpClient) {}

  getTransactions(limit: number, offset: number): Observable<PaginatedTransactions> {
    const params = new HttpParams()
      .set('limit', limit.toString())
      .set('offset', offset.toString());
    return this.http.get<PaginatedTransactions>(this.apiUrl, {params});
  }
}
