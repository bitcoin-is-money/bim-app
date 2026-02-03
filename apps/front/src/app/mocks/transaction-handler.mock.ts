import {HttpRequest, HttpResponse} from '@angular/common/http';
import type {PaginatedTransactions, Transaction} from '../services/transaction.http.service';
import {DataStoreMock} from "./data-store.mock";

const MOCK_STARKNET_ADDRESS = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';
const MOCK_TOKEN_ADDRESS = '0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac';

function mockTx(id: string, type: 'send' | 'receive', amount: string, daysAgo: number): Transaction {
  const date = new Date(Date.now() - daysAgo * 86_400_000);
  return {
    id,
    transactionHash: '0x' + id.padStart(64, '0'),
    blockNumber: String(800000 - daysAgo),
    type,
    amount,
    tokenAddress: MOCK_TOKEN_ADDRESS,
    fromAddress: type === 'receive' ? '0x0123456789abcdef' : MOCK_STARKNET_ADDRESS,
    toAddress: type === 'send' ? '0x0123456789abcdef' : MOCK_STARKNET_ADDRESS,
    timestamp: date.toISOString(),
    indexedAt: date.toISOString(),
  };
}

const MOCK_TRANSACTIONS: Transaction[] = [
  mockTx('1', 'receive', '5000000', 1),
  mockTx('2', 'send', '2500000', 2),
  mockTx('3', 'receive', '15000000', 3),
  mockTx('4', 'send', '750000', 5),
  mockTx('5', 'receive', '32000000', 6),
  mockTx('6', 'send', '1200000', 8),
  mockTx('7', 'receive', '8500000', 10),
  mockTx('8', 'send', '450000', 12),
  mockTx('9', 'receive', '20000000', 14),
  mockTx('10', 'send', '3000000', 15),
  mockTx('11', 'receive', '6700000', 18),
  mockTx('12', 'send', '9900000', 20),
  mockTx('13', 'receive', '1100000', 22),
  mockTx('14', 'send', '500000', 24),
  mockTx('15', 'receive', '42000000', 25),
  mockTx('16', 'send', '2800000', 27),
  mockTx('17', 'receive', '600000', 28),
  mockTx('18', 'send', '1500000', 30),
  mockTx('19', 'receive', '7300000', 32),
  mockTx('20', 'send', '4100000', 34),
  mockTx('21', 'receive', '900000', 36),
  mockTx('22', 'send', '11000000', 38),
  mockTx('23', 'receive', '350000', 40),
  mockTx('24', 'send', '6000000', 42),
  mockTx('25', 'receive', '18000000', 44),
];

export class TransactionHandlerMock {

  constructor(
    private readonly store: DataStoreMock
  ) {
  }

  getTransactions(req: HttpRequest<unknown>): HttpResponse<PaginatedTransactions> {
    if (!this.store.getMockUserProfile().hasTransactions) {
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
