import type { HttpRequest } from '@angular/common/http';
import { HttpResponse } from '@angular/common/http';
import type { PaginatedTransactions, Transaction } from '../../services/transaction.http.service';
import type { DataStoreMock } from '../data-store.mock';

const MOCK_STARKNET_ADDRESS = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';
const MOCK_TOKEN_ADDRESS = '0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac';

/**
 * Module-scoped list of transactions simulated during the current session.
 * Used to emulate the Apibara indexer picking up incoming/outgoing Starknet
 * transfers a few seconds after the user creates a Starknet receive or
 * submits a Starknet payment — so that `transactionService.waitForNew()`
 * actually detects something in mock mode.
 */
const DYNAMIC_TRANSACTIONS: Transaction[] = [];

/**
 * Schedules a simulated Starknet transaction to appear after `delayMs`.
 * Called by the receive and payment mock handlers to exercise the
 * transaction detection flow in mock mode.
 */
export function scheduleSimulatedStarknetTransaction(
  type: 'receipt' | 'spent',
  amountSats: number,
  counterpartyAddress: string,
  delayMs: number,
): void {
  setTimeout(() => {
    const id = 'dyn-' + String(Date.now());
    const now = new Date();
    DYNAMIC_TRANSACTIONS.unshift({
      id,
      transactionHash: '0x' + id.padStart(64, '0'),
      blockNumber: String(800000),
      type,
      amount: String(amountSats),
      tokenAddress: MOCK_TOKEN_ADDRESS,
      fromAddress: type === 'receipt' ? counterpartyAddress : MOCK_STARKNET_ADDRESS,
      toAddress: type === 'spent' ? counterpartyAddress : MOCK_STARKNET_ADDRESS,
      timestamp: now.toISOString(),
      indexedAt: now.toISOString(),
    });
  }, delayMs);
}

function mockTx(
  id: string,
  type: 'spent' | 'receipt',
  amount: string,
  daysAgo: number,
  description?: string,
): Transaction {
  const date = new Date(Date.now() - daysAgo * 86_400_000);
  return {
    id,
    transactionHash: '0x' + id.padStart(64, '0'),
    blockNumber: String(800000 - daysAgo),
    type,
    amount,
    tokenAddress: MOCK_TOKEN_ADDRESS,
    fromAddress: type === 'receipt' ? '0x0123456789abcdef' : MOCK_STARKNET_ADDRESS,
    toAddress: type === 'spent' ? '0x0123456789abcdef' : MOCK_STARKNET_ADDRESS,
    timestamp: date.toISOString(),
    indexedAt: date.toISOString(),
    ...(description ? { description } : {}),
  };
}

const MOCK_TRANSACTIONS: Transaction[] = [
  mockTx('26', 'receipt', '206186', 1, 'adma birthday'),
  mockTx('27', 'spent', '1997938', 1, 'New grillz'),
  mockTx('28', 'spent', '5196', 1, 'Coffee'),
  mockTx('29', 'receipt', '15505', 2, 'no desc -'),
  mockTx('30', 'receipt', '23711', 3, 'Beers after a long run'),
  mockTx('31', 'spent', '15505', 4, 'no desc -'),
  mockTx('1', 'receipt', '5000000', 1, 'Salary'),
  mockTx(
    '2',
    'spent',
    '2500000',
    2,
    'Rent looooooooooooooooooooooooooooooooonnnnnnngggggggggggggggggggg and multi line ',
  ),
  mockTx('3', 'receipt', '15000000', 3),
  mockTx('4', 'spent', '750000', 5, 'Coffeeeeeeeeeeeeeeeeeeeeeeeeee shop'),
  mockTx('5', 'receipt', '32000000', 6, 'Freelance gig'),
  mockTx('6', 'spent', '1200000', 8),
  mockTx('7', 'receipt', '8500000', 10, 'Refund'),
  mockTx('8', 'spent', '450000', 12),
  mockTx('9', 'receipt', '20000000', 14, 'Invoice #1042'),
  mockTx('10', 'spent', '3000000', 15, 'VPN subscription'),
  mockTx('11', 'receipt', '6700000', 18),
  mockTx('12', 'spent', '9900000', 20, 'Hardware wallet'),
  mockTx('13', 'receipt', '1100000', 22),
  mockTx('14', 'spent', '500000', 24),
  mockTx('15', 'receipt', '42000000', 25, 'Bonus'),
  mockTx('16', 'spent', '2800000', 27),
  mockTx('17', 'receipt', '600000', 28),
  mockTx('18', 'spent', '1500000', 30, 'Gift'),
  mockTx('19', 'receipt', '7300000', 32),
  mockTx('20', 'spent', '4100000', 34),
  mockTx('21', 'receipt', '900000', 36),
  mockTx('22', 'spent', '11000000', 38, 'Domain name'),
  mockTx('23', 'receipt', '350000', 40),
  mockTx('24', 'spent', '6000000', 42),
  mockTx('25', 'receipt', '18000000', 44),
];

export class TransactionHandlerMock {
  constructor(private readonly store: DataStoreMock) {}

  getTransactions(req: HttpRequest<unknown>): HttpResponse<PaginatedTransactions> {
    const hasHistoricalTxs = this.store.getMockUserProfile().hasTransactions;
    const allTransactions: Transaction[] = hasHistoricalTxs
      ? [...DYNAMIC_TRANSACTIONS, ...MOCK_TRANSACTIONS]
      : [...DYNAMIC_TRANSACTIONS];

    const urlParams = new URL(req.urlWithParams, 'http://localhost').searchParams;
    const limit = Number(urlParams.get('limit') ?? '10');
    const offset = Number(urlParams.get('offset') ?? '0');
    const page = allTransactions.slice(offset, offset + limit);

    return new HttpResponse({
      status: 200,
      body: {
        transactions: page,
        total: allTransactions.length,
        limit,
        offset,
      },
    });
  }
}
