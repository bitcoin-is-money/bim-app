import {HttpResponse} from '@angular/common/http';
import type {Transaction} from '../services/transaction.service';
import {DataStoreMock} from "./data-store.mock";

export class TransactionHandlerMock {

  constructor(
    private readonly store: DataStoreMock
  ) {
  }

  // GET /api/transactions
  getTransactions(): HttpResponse<Transaction[]> {
    let transactions: Transaction[] = this.store.hasNoTransaction() ? [] : [
      {
        id: '1',
        date: '2026-01-15',
        name: 'Grocery Store',
        amount: -25.5,
      },
      {
        id: '2',
        date: '2026-01-18',
        name: 'Salary Deposit',
        amount: 150.0,
      },
      {
        id: '3',
        date: '2026-01-20',
        name: 'Coffee Shop',
        amount: -4.75,
      },
    ];
    return new HttpResponse({
      status: 200,
      body: transactions
    });
  }
}
