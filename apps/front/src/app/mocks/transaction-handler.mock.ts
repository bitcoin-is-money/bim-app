import {HttpRequest, HttpResponse} from '@angular/common/http';
import type {PaginatedTransactions, Transaction} from '../services/transaction.http.service';
import {DataStoreMock} from "./data-store.mock";

const MOCK_TRANSACTIONS: Transaction[] = [
  {id: '1', date: '2026-01-01', name: 'Grocery Store', amount: -25.50},
  {id: '2', date: '2026-01-02', name: 'Salary Deposit', amount: 150.00},
  {id: '3', date: '2026-01-03', name: 'Coffee Shop', amount: -4.75},
  {id: '4', date: '2026-01-04', name: 'Freelance Payment', amount: 320.00},
  {id: '5', date: '2026-01-05', name: 'Electric Bill', amount: -85.00},
  {id: '6', date: '2026-01-06', name: 'Restaurant', amount: -42.30},
  {id: '7', date: '2026-01-07', name: 'Online Transfer', amount: 75.00},
  {id: '8', date: '2026-01-08', name: 'Subscription', amount: -12.99},
  {id: '9', date: '2026-01-09', name: 'Gas Station', amount: -55.00},
  {id: '10', date: '2026-01-10', name: 'Refund', amount: 30.00},
  {id: '11', date: '2026-01-11', name: 'Bookstore', amount: -18.50},
  {id: '12', date: '2026-01-12', name: 'Client Payment', amount: 500.00},
  {id: '13', date: '2026-01-13', name: 'Pharmacy', amount: -22.40},
  {id: '14', date: '2026-01-14', name: 'Bus Pass', amount: -45.00},
  {id: '15', date: '2026-01-15', name: 'Bonus', amount: 200.00},
  {id: '16', date: '2026-01-16', name: 'Hardware Store', amount: -67.80},
  {id: '17', date: '2026-01-17', name: 'Gym Membership', amount: -29.99},
  {id: '18', date: '2026-01-18', name: 'Dividend', amount: 15.00},
  {id: '19', date: '2026-01-19', name: 'Clothing Store', amount: -89.00},
  {id: '20', date: '2026-01-20', name: 'Freelance Payment', amount: 180.00},
  {id: '21', date: '2026-01-21', name: 'Internet Bill', amount: -39.99},
  {id: '22', date: '2026-01-22', name: 'Gift Received', amount: 50.00},
  {id: '23', date: '2026-01-23', name: 'Taxi', amount: -15.50},
  {id: '24', date: '2026-01-24', name: 'Supermarket', amount: -102.30},
  {id: '25', date: '2026-01-25', name: 'Consulting Fee', amount: 400.00},
];

export class TransactionHandlerMock {

  constructor(
    private readonly store: DataStoreMock
  ) {
  }

  getTransactions(req: HttpRequest<unknown>): HttpResponse<PaginatedTransactions> {
    if (this.store.hasNoTransaction()) {
      return new HttpResponse({
        status: 200,
        body: {transactions: [], total: 0, limit: 10, offset: 0},
      });
    }

    const urlParams = new URL(req.urlWithParams, 'http://localhost').searchParams;
    const limit = Number(urlParams.get('limit') ?? '10');
    const offset = Number(urlParams.get('offset') ?? '0');
    const page = MOCK_TRANSACTIONS.slice(offset, offset + limit);

    return new HttpResponse({
      status: 200,
      body: {
        transactions: page,
        total: MOCK_TRANSACTIONS.length,
        limit,
        offset,
      },
    });
  }
}
