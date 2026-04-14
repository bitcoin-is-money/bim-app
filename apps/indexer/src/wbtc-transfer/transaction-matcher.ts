import type {NewTransactionRecord} from '@bim/db';
import type {Logger} from 'pino';
import type {AccountMatch, TransferEvent} from './types.js';

export class TransactionMatcher {
  private readonly contractAddress: string;
  private readonly logger: Logger;

  constructor(contractAddress: string, logger: Logger) {
    this.contractAddress = contractAddress;
    this.logger = logger.child({name: 'transaction-matcher.ts'});
  }

  /**
   * Match transfers against known accounts and build transaction rows.
   * A transfer produces a 'spent' row if `from` matches, and a 'receipt' row if `to` matches.
   */
  match(
    transfers: TransferEvent[],
    accounts: AccountMatch[],
    blockNumber: string,
    blockTimestamp: Date,
  ): NewTransactionRecord[] {
    const referencedAddresses = new Set(transfers.flatMap(t => [t.from, t.to]));
    const addressToAccountId = new Map<string, string>();

    for (const account of accounts) {
      const addr = account.starknetAddress.toLowerCase();
      if (referencedAddresses.has(addr)) {
        addressToAccountId.set(addr, account.id);
      }
    }
    if (addressToAccountId.size === 0) {
      return [];
    }

    const rows: NewTransactionRecord[] = [];

    for (const {from, to, amount, txHash} of transfers) {
      const fromAccountId = addressToAccountId.get(from);
      if (fromAccountId) {
        rows.push({
          id: crypto.randomUUID(),
          accountId: fromAccountId,
          transactionHash: txHash,
          blockNumber,
          transactionType: 'spent',
          amount,
          tokenAddress: this.contractAddress,
          fromAddress: from,
          toAddress: to,
          timestamp: blockTimestamp,
          indexedAt: new Date(),
        });
      }

      const toAccountId = addressToAccountId.get(to);
      if (toAccountId) {
        rows.push({
          id: crypto.randomUUID(),
          accountId: toAccountId,
          transactionHash: txHash,
          blockNumber,
          transactionType: 'receipt',
          amount,
          tokenAddress: this.contractAddress,
          fromAddress: from,
          toAddress: to,
          timestamp: blockTimestamp,
          indexedAt: new Date(),
        });
      }
    }

    const merged = this.mergeMulticallRows(rows);

    this.logger.debug(`[Block ${blockNumber}] Transactions matched (${merged.length})`);
    return merged;
  }

  /**
   * Merge multicall rows that share the same (txHash, accountId, type).
   *
   * A single transaction can emit several Transfer events (e.g., payment and fee).
   * The DB has a unique constraint on (txHash, accountId, type), so we collapse
   * each group into one row: sum amounts, and keep the address fields from
   * the largest transfer (the main one — smaller transfers are fees).
   */
  private mergeMulticallRows(rows: NewTransactionRecord[]): NewTransactionRecord[] {
    if (rows.length <= 1) return rows;

    const groups = new Map<string, NewTransactionRecord[]>();
    for (const row of rows) {
      const key = `${row.transactionHash}|${row.accountId}|${row.transactionType}`;
      const existing = groups.get(key);
      if (existing) existing.push(row);
      else groups.set(key, [row]);
    }

    return [...groups.values()].map(group => {
      const first = group[0];
      if (first === undefined) {
        throw new Error('unreachable: empty group');
      }
      let largest = first;
      let totalAmount = 0n;
      for (const row of group) {
        totalAmount += BigInt(row.amount);
        if (BigInt(row.amount) > BigInt(largest.amount)) largest = row;
      }
      return {...largest, amount: totalAmount.toString()};
    });
  }
}
