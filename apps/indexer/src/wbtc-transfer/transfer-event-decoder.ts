import {basename} from 'node:path';
import type {Event} from '@apibara/starknet';
import type {Logger} from 'pino';
import {addAddressPadding, uint256} from 'starknet';
import type {TransferEvent} from './types.js';

export class TransferEventDecoder {
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({name: basename(import.meta.filename)});
  }

  /**
   * Decode raw Starknet events into typed TransferEvents.
   *
   * ERC20 Transfer event layout (Cairo):
   *   keys: [selector, from_address, to_address]
   *   data: [amount_low, amount_high] ← uint256 split into two felt252
   *
   * Events that don't match this layout (e.g. different event types included
   * in the same filter, or malformed events) are silently skipped.
   */
  decode(events: readonly Event[]): TransferEvent[] {
    const transfers: TransferEvent[] = [];

    for (const event of events) {
      // Skip non-Transfer events: a valid Transfer must have at least
      // 3 keys (selector + from + to) and 2 data fields (u256 low + high).
      if (event.keys.length < 3 || event.data.length < 2) continue;

      transfers.push({
        from: addAddressPadding(event.keys[1]),
        to: addAddressPadding(event.keys[2]),
        // Reconstruct the uint256 amount from its low/high felt252 parts
        amount: uint256.uint256ToBN({low: event.data[0], high: event.data[1]}).toString(),
        txHash: addAddressPadding(event.transactionHash),
      });
    }

    this.logger.debug(`Transfer events decoded (${transfers.length})`);
    return transfers;
  }
}
