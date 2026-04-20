import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

export interface Transaction {
  id: string;
  transactionHash: string;
  blockNumber: string;
  type: string;
  amount: string;
  tokenAddress: string;
  fromAddress: string;
  toAddress: string;
  timestamp: string;
  indexedAt: string;
  description?: string;
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
  private readonly apiUrl = '/api/user/transactions';
  private readonly http = inject(HttpClient);

  getTransactions(limit: number, offset: number): Observable<PaginatedTransactions> {
    const params = new HttpParams().set('limit', limit.toString()).set('offset', offset.toString());
    return this.http.get<PaginatedTransactions>(this.apiUrl, { params });
  }
}
