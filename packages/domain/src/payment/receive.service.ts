import type {Logger} from 'pino';
import {type Amount, BitcoinAddress, type StarknetAddress, type StarknetConfig} from '../shared';
import {LightningInvoice, type SwapService} from '../swap';
import {InvalidPaymentAmountError} from './errors';
import type {BitcoinReceiveResult, ReceivePaymentInput, ReceiveResult} from './receive.types';

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
  // TODO: amount should become optional for all networks (amountless invoices / open deposits)
  async receive(input: ReceivePaymentInput): Promise<ReceiveResult> {
    if (input.network !== 'starknet' && (!input.amount?.isPositive())) {
      throw new InvalidPaymentAmountError(input.network, input.amount?.getSat() ?? 0n);
    }

    this.log.info({network: input.network, amountSats: input.amount?.toSatString()}, 'Creating receive request');
    switch (input.network) {
      case 'starknet':
        return {
          network: 'starknet',
          ...this.receiveStarknet(input.destinationAddress, input.amount, input.useUriPrefix, input.description)};
      case 'lightning': {
        const description = input.description ?? 'Received';
        return {
          network: 'lightning',
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          ...(await this.receiveLightning(input.destinationAddress, input.amount!, input.accountId, description))};
      }
      case 'bitcoin': {
        const description = input.description ?? 'Received';
        return {
          network: 'bitcoin',
          status: 'pending_commit' as const,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          ...(await this.prepareBitcoinReceive(input.destinationAddress, input.amount!, input.accountId, description))};
      }
    }
  }

  // ===========================================================================
  // Starknet — generate starknet: URI
  // ===========================================================================

  // TODO: support multiple tokens when the app handles more than WBTC
  private receiveStarknet(address: StarknetAddress, amount?: Amount, useUriPrefix = true, description?: string) {
    const token = this.deps.starknetConfig.wbtcTokenAddress;
    const prefix = useUriPrefix ? 'starknet:' : '';

    let uri = `${prefix}${address}`;
    const params = new URLSearchParams();
    if (amount?.isPositive()) {
      params.set('amount', amount.toSatString());
      params.set('token', token);
    }
    if (description) {
      params.set('description', description);
    }
    const qs = params.toString();
    if (qs) {
      uri += `?${qs}`;
    }

    return {address, uri};
  }

  // ===========================================================================
  // Lightning — Lightning → Starknet swap (returns invoice)
  // ===========================================================================

  private async receiveLightning(destinationAddress: StarknetAddress, amount: Amount, accountId: string, description: string) {
    const result = await this.deps.swapService.createLightningToStarknet({
      amount,
      destinationAddress,
      accountId,
      description,
    });

    return {
      swapId: result.swap.data.id,
      invoice: LightningInvoice.of(result.invoice),
      amount,
      expiresAt: result.swap.data.expiresAt,
    };
  }

  // ===========================================================================
  // Bitcoin — Phase 1: Prepare (returns commit transactions for signing)
  // ===========================================================================

  private async prepareBitcoinReceive(
    destinationAddress: StarknetAddress,
    amount: Amount,
    accountId: string,
    description: string,
  ) {
    const result = await this.deps.swapService.prepareBitcoinToStarknet({
      amount,
      destinationAddress,
      accountId,
      description,
    });

    return {
      swapId: result.swapId,
      commitCalls: result.commitCalls,
      amount,
      expiresAt: result.expiresAt,
    };
  }

  // ===========================================================================
  // Bitcoin — Phase 2: Complete (after commit is on-chain, returns deposit address)
  // ===========================================================================

  async completeBitcoinReceive(params: {
    swapId: string;
    useUriPrefix: boolean;
  }): Promise<{network: 'bitcoin'} & BitcoinReceiveResult> {
    const result = await this.deps.swapService.completeBitcoinToStarknet({
      swapId: params.swapId,
    });

    const bip21Uri = params.useUriPrefix
      ? result.bip21Uri
      : result.bip21Uri.replace(/^bitcoin:/i, '');

    return {
      network: 'bitcoin',
      swapId: result.swap.data.id,
      depositAddress: BitcoinAddress.of(result.depositAddress, this.deps.starknetConfig.bitcoinNetwork),
      bip21Uri,
      amount: result.swap.data.amount,
      expiresAt: result.swap.data.expiresAt,
    };
  }
}
