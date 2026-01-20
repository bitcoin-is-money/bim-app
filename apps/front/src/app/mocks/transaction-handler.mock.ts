import {HttpResponse} from '@angular/common/http';
import type {Transaction} from '../services/transaction.service';

export class TransactionHandlerMock {
  // GET /api/transactions
  getTransactions(): HttpResponse<Transaction[]> {
    return new HttpResponse({
      status: 200,
      body: [
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
      ],
    });
  }
}
