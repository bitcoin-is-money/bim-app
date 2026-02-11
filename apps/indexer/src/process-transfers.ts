import type {Event} from '@apibara/starknet';
import type {NewTransactionRecord} from '@bim/db';
import {decodeU256, normalizeAddress} from './starknet.js';
import type {AccountMatch, TransferEvent} from './types.js';

/**
 * Decode Starknet Transfer events into typed TransferEvents.
 * Expects ERC20 Transfer layout: keys[0]=selector, keys[1]=from, keys[2]=to, data[0..1]=u256.
 */
export function decodeTransferEvents(events: readonly Event[]): TransferEvent[] {
  const transfers: TransferEvent[] = [];

  for (const event of events) {
    if (event.keys.length < 3 || event.data.length < 2) continue;

    transfers.push({
      from: normalizeAddress(event.keys[1]),
      to: normalizeAddress(event.keys[2]),
      amount: decodeU256(event.data[0], event.data[1]),
      txHash: normalizeAddress(event.transactionHash),
    });
  }

  return transfers;
}

/**
 * Match transfers against known accounts and build transaction rows.
 * A transfer produces a 'spent' row if `from` matches, and a 'receipt' row if `to` matches.
 */
export function buildTransactionRows(
  transfers: TransferEvent[],
  accounts: AccountMatch[],
  contractAddress: string,
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
        tokenAddress: contractAddress,
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
        tokenAddress: contractAddress,
        fromAddress: from,
        toAddress: to,
        timestamp: blockTimestamp,
        indexedAt: new Date(),
      });
    }
  }

  return rows;
}
