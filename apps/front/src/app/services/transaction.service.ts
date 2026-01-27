import {computed, inject, Injectable, signal} from '@angular/core';
import {delay} from 'rxjs';
import {TransactionHttpService} from './transaction.http.service';
import type {Transaction} from './transaction.http.service';

export type {Transaction} from './transaction.http.service';

const PAGE_SIZE = 10;

@Injectable({
  providedIn: 'root',
})
export class TransactionService {

  private readonly httpService: TransactionHttpService = inject(TransactionHttpService);
  private readonly _transactions = signal<Transaction[] | undefined>(undefined);
  private readonly _hasMore = signal(true);
  private readonly _isLoadingMore = signal(false);
  private offset = 0;

  readonly transactions = this._transactions.asReadonly();
  readonly hasMore = this._hasMore.asReadonly();
  readonly isLoadingMore = this._isLoadingMore.asReadonly();
  readonly isEmpty = computed(() => {
    return this._transactions()?.length === 0;
  });

  setEmpty(): void {
    this.offset = 0;
    this._transactions.set([]);
    this._hasMore.set(false);
  }

  loadFirst(): void {
    this.offset = 0;
    this._transactions.set(undefined);
    this._hasMore.set(true);
    this.loadNext();
  }

  loadMore(): void {
    if (this._isLoadingMore() || !this._hasMore()) {
      return;
    }
    this.loadNext();
  }

  private loadNext(): void {
    this._isLoadingMore.set(true);

    this.httpService.getTransactions(PAGE_SIZE, this.offset).pipe(delay(2000)).subscribe({
      next: (response) => {
        const current = this._transactions() ?? [];
        this._transactions.set([...current, ...response.transactions]);
        this.offset += response.transactions.length;
        this._hasMore.set(this.offset < response.total);
        this._isLoadingMore.set(false);
      },
      error: (err) => {
        console.error('Error loading transactions:', err);
        this._isLoadingMore.set(false);
        if (this._transactions() === undefined) {
          this._transactions.set([]);
        }
      },
    });
  }
}
