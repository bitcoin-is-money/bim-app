import type {Event} from '@apibara/starknet';
import type {Logger} from 'pino';
import {addAddressPadding, uint256} from 'starknet';
import type {TransferEvent} from './types.js';

export class TransferEventDecoder {
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({name: 'transfer-event-decoder.ts'});
  }

  /**
   * Decode raw Starknet events into typed TransferEvents.
   *
   * Supports two ERC-20 Transfer event layouts:
   *
   * Cairo 1 (indexed from/to):
   *   keys: [selector, from_address, to_address]
   *   data: [amount_low, amount_high]
   *
   * Cairo 0 / legacy (non-indexed from/to):
   *   keys: [selector]
   *   data: [from_address, to_address, amount_low, amount_high]
   *
   * Events with an unrecognized layout emit a warning and are skipped.
   */
  decode(events: readonly Event[]): TransferEvent[] {
    const transfers: TransferEvent[] = [];

    for (const event of events) {
      // Cairo 1: keys=[selector, from, to], data=[amount_low, amount_high]
      if (event.keys.length >= 3 && event.data.length >= 2) {
        const [, from, to] = event.keys;
        const [low, high] = event.data;
        if (from !== undefined && to !== undefined && low !== undefined && high !== undefined) {
          transfers.push({
            from: addAddressPadding(from),
            to: addAddressPadding(to),
            amount: uint256.uint256ToBN({low, high}).toString(),
            txHash: addAddressPadding(event.transactionHash),
          });
          continue;
        }
      }
      // Cairo 0 (legacy): keys=[selector], data=[from, to, amount_low, amount_high]
      if (event.keys.length >= 1 && event.data.length >= 4) {
        const [from, to, low, high] = event.data;
        if (from !== undefined && to !== undefined && low !== undefined && high !== undefined) {
          transfers.push({
            from: addAddressPadding(from),
            to: addAddressPadding(to),
            amount: uint256.uint256ToBN({low, high}).toString(),
            txHash: addAddressPadding(event.transactionHash),
          });
          continue;
        }
      }
      this.logger.warn(
        {keys: event.keys.length, data: event.data.length, txHash: event.transactionHash},
        'Unrecognized Transfer event layout — skipping',
      );
    }

    this.logger.debug(`Transfer events decoded (${transfers.length})`);
    return transfers;
  }
}
