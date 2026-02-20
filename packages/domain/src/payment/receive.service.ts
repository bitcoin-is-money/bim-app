
import type {Logger} from 'pino';
import type {StarknetAddress} from '../account';
import {Amount, type StarknetConfig} from '../shared';
import {BitcoinAddress, LightningInvoice, type SwapService} from '../swap';
import {InvalidPaymentAmountError, type ReceivePaymentInput, type ReceiveResult,} from './types';

// =============================================================================
// Dependencies
// =============================================================================

export interface ReceiveServiceDeps {
  swapService: SwapService;
  starknetConfig: StarknetConfig;
  logger: Logger;
}

// =============================================================================
// Service Class
// =============================================================================

/**
 * Receive service — handles incoming payments (receive).
 *
 * For Lightning and Bitcoin, creates a swap (invoice or deposit address).
 * For Starknet, returns the user's address + a starknet: URI.
 */
export class ReceiveService {
  private readonly log: Logger;

  constructor(private readonly deps: ReceiveServiceDeps) {
    this.log = deps.logger.child({name: 'receive.service.ts'});
  }

  /**
   * Create a receive request for the given network.
   *
   * @throws InvalidPaymentAmountError if amount <= 0
   * @throws SwapAmountError if amount is outside swap limits
   * @throws SwapCreationError if invoice/address generation fails
   */
  async receive(input: ReceivePaymentInput): Promise<ReceiveResult> {
    if (!input.amount || !input.amount.isPositive()) {
      throw new InvalidPaymentAmountError(input.network, input.amount?.getSat() ?? 0n);
    }

    this.log.info({network: input.network, amountSats: input.amount.toSatString()}, 'Creating receive request');
    switch (input.network) {
      case 'starknet':
        return {network: 'starknet', ...this.receiveStarknet(input.destinationAddress, input.amount, input.tokenAddress)};
      case 'lightning':
        return {network: 'lightning', ...(await this.receiveLightning(input.destinationAddress, input.amount, input.description, input.accountId))};
      case 'bitcoin':
        return {network: 'bitcoin', ...(await this.receiveBitcoin(input.destinationAddress, input.amount, input.description, input.accountId))};
    }
  }

  // ===========================================================================
  // Starknet — generate starknet: URI
  // ===========================================================================

  private receiveStarknet(address: StarknetAddress, amount?: Amount, tokenAddress?: string) {
    const token = tokenAddress ?? this.deps.starknetConfig.wbtcTokenAddress;

    let uri = `starknet:${address}`;
    if (amount) {
      uri += `?amount=${amount.toSatString()}&token=${token}`;
    }

    return {address, uri};
  }

  // ===========================================================================
  // Lightning — Lightning → Starknet swap (returns invoice)
  // ===========================================================================

  private async receiveLightning(destinationAddress: StarknetAddress, amount: Amount, description?: string, accountId?: string) {
    const result = await this.deps.swapService.createLightningToStarknet({
      amount,
      destinationAddress,
      description,
      accountId,
    });

    return {
      swapId: result.swap.id,
      invoice: LightningInvoice.of(result.invoice),
      amount,
      expiresAt: result.swap.expiresAt,
    };
  }

  // ===========================================================================
  // Bitcoin — Bitcoin → Starknet swap (returns deposit address)
  // ===========================================================================

  private async receiveBitcoin(destinationAddress: StarknetAddress, amount: Amount, description?: string, accountId?: string) {
    const result = await this.deps.swapService.createBitcoinToStarknet({
      amount,
      destinationAddress,
      description,
      accountId,
    });

    return {
      swapId: result.swap.id,
      depositAddress: BitcoinAddress.of(result.depositAddress),
      bip21Uri: result.bip21Uri,
      amount,
      expiresAt: result.swap.expiresAt,
    };
  }
}
