import {computed, inject, Injectable, signal} from '@angular/core';
import type {Observable, Subscription} from 'rxjs';
import {filter, interval, map, switchMap, take, tap} from 'rxjs';
import type {RailNetwork} from '../components/rail-badge/rail-badge.component';
import type {ConversionRates} from '../model';
import {Amount, Currency} from '../model';
import {CurrencyService} from './currency.service';
import {I18nService} from './i18n.service';
import type {Transaction} from './transaction.http.service';
import {TransactionHttpService} from './transaction.http.service';

export type {Transaction} from './transaction.http.service';

export interface DisplayedTransaction {
  original: Transaction;
  formattedAmount: string;
  formattedAmountSecondary: string | undefined;
  currency: Currency;
  network: RailNetwork;
  isCredit: boolean;
}

export interface WaitForNewOptions {
  intervalMs?: number;
  maxAttempts?: number;
  onDetected?: () => void;
}

const PAGE_SIZE = 10;

@Injectable({
  providedIn: 'root',
})
export class TransactionService {

  private readonly httpService: TransactionHttpService = inject(TransactionHttpService);
  private readonly currencyService: CurrencyService = inject(CurrencyService);
  private readonly i18nService = inject(I18nService);
  private readonly _transactions = signal<Transaction[] | undefined>(undefined);
  private readonly _hasMore = signal(true);
  private readonly _isLoadingMore = signal(false);
  private offset = 0;

  readonly isLoadingMore = this._isLoadingMore.asReadonly();

  readonly isEmpty = computed(() => {
    return this._transactions()?.length === 0;
  });

  readonly displayedTransactions = computed(() => {
    const txs = this._transactions();
    if (!txs) return undefined;

    const currency = this.currencyService.currentCurrency();
    const rates = this.currencyService.rates();
    const locale = this.i18nService.currentLocale();

    return txs.map(tx => this.toDisplayed(tx, currency, rates, locale));
  });

  private toDisplayed(
    tx: Transaction,
    currency: Currency,
    rates: ConversionRates,
    locale: string
  ): DisplayedTransaction {
    const sats = Number(tx.amount);
    const isCredit = tx.type === 'receipt';
    const sign = isCredit ? '+' : '-';
    const amount = Amount.of(sats, 'SAT').convert(currency, rates);
    const formattedAmount = `${sign}${amount.format(locale)} ${Currency.symbol(currency)}`;
    const secondaryCurrency: Currency = currency === 'SAT' || currency === 'BTC' ? 'USD' : 'SAT';
    const secondaryAmount = Amount.of(sats, 'SAT').convert(secondaryCurrency, rates);
    const formattedAmountSecondary = secondaryAmount.value !== sats || secondaryCurrency !== 'SAT'
      ? `${secondaryAmount.format(locale)} ${Currency.symbol(secondaryCurrency)}`
      : undefined;

    return {
      original: tx,
      formattedAmount,
      formattedAmountSecondary,
      currency,
      network: 'starknet',
      isCredit,
    };
  }

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

  refresh(): Observable<void> {
    this.offset = 0;
    this._hasMore.set(true);
    return this.httpService.getTransactions(PAGE_SIZE, 0).pipe(
      tap((response) => {
        this._transactions.set(response.transactions);
        this.offset = response.transactions.length;
        this._hasMore.set(this.offset < response.total);
      }),
      map(() => undefined),
    );
  }

  /**
   * Polls the backend until a new transaction appears or the timeout is reached.
   * Used after Starknet direct payments (send) and Starknet receives where there
   * is no swap to track. Captures the current server-side total before polling
   * to avoid firing on stale local state. Stops immediately on detection.
   */
  waitForNew(options: WaitForNewOptions = {}): Subscription {
    const intervalMs = options.intervalMs ?? 2000;
    const maxAttempts = options.maxAttempts ?? 15;

    return this.httpService.getTransactions(1, 0).pipe(
      switchMap((initial) =>
        interval(intervalMs).pipe(
          take(maxAttempts),
          switchMap(() => this.httpService.getTransactions(1, 0)),
          filter((result) => result.total > initial.total),
          take(1),
        ),
      ),
    ).subscribe(() => {
      this.loadFirst();
      options.onDetected?.();
    });
  }

  loadMore(): void {
    if (this._isLoadingMore() || !this._hasMore()) {
      return;
    }
    this.loadNext();
  }

  private loadNext(): void {
    this._isLoadingMore.set(true);

    this.httpService.getTransactions(PAGE_SIZE, this.offset).subscribe({
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
