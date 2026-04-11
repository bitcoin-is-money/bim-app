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
        transfers.push({
          from: addAddressPadding(event.keys[1]!),
          to: addAddressPadding(event.keys[2]!),
          amount: uint256.uint256ToBN({low: event.data[0]!, high: event.data[1]!}).toString(),
          txHash: addAddressPadding(event.transactionHash),
        });
      }
      // Cairo 0 (legacy): keys=[selector], data=[from, to, amount_low, amount_high]
      else if (event.keys.length >= 1 && event.data.length >= 4) {
        transfers.push({
          from: addAddressPadding(event.data[0]!),
          to: addAddressPadding(event.data[1]!),
          amount: uint256.uint256ToBN({low: event.data[2]!, high: event.data[3]!}).toString(),
          txHash: addAddressPadding(event.transactionHash),
        });
      } else {
        this.logger.warn(
          {keys: event.keys.length, data: event.data.length, txHash: event.transactionHash},
          'Unrecognized Transfer event layout — skipping',
        );
      }
    }

    this.logger.debug(`Transfer events decoded (${transfers.length})`);
    return transfers;
  }
}
