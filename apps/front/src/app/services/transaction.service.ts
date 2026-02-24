import {computed, inject, Injectable, signal} from '@angular/core';
import {TransactionHttpService} from './transaction.http.service';
import type {Transaction} from './transaction.http.service';
import {CurrencyService} from './currency.service';
import {I18nService} from './i18n.service';
import {Amount, ConversionRates, Currency} from '../model';

export type {Transaction} from './transaction.http.service';

export interface DisplayedTransaction {
  original: Transaction;
  formattedAmount: string;
  currency: Currency;
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
    const sign = tx.type === 'receipt' ? '+' : '-';
    const amount = Amount.of(sats, 'SAT').convert(currency, rates);
    const formattedAmount = `${sign}${amount.format(locale)} ${Currency.symbol(currency)}`;

    return {
      original: tx,
      formattedAmount,
      currency,
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
