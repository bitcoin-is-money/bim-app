
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

    this.logger.debug(`[Block ${blockNumber}] Transactions matched (${rows.length})`);
    return rows;
  }
}
