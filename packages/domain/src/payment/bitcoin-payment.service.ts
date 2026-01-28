import {StarknetAddress} from '../account';
import type {StarknetGateway} from '../ports';
import {Amount, type StarknetConfig} from '../shared';
import {BitcoinAddress, type SwapService} from '../swap';
import type {Erc20CallFactory} from './erc20-call.factory';
import {
  InvalidPaymentAddressError,
  InvalidPaymentAmountError,
  type BitcoinPaymentResult,
  type BitcoinReceiveResult,
  MissingPaymentAmountError,
  type ParsedPaymentData,
  type PayBitcoinInput,
  type ReceiveBitcoinInput,
} from './types';

// =============================================================================
// Dependencies
// =============================================================================

export interface BitcoinPaymentServiceDeps {
  swapService: SwapService;
  starknetGateway: StarknetGateway;
  starknetConfig: StarknetConfig;
  erc20CallFactory: Erc20CallFactory;
}

// =============================================================================
// Service
// =============================================================================

/**
 * Bitcoin-specific payment service.
 *
 * Handles:
 * - Parsing BIP-21 `bitcoin:` URIs
 * - Paying Bitcoin addresses (Starknet → Bitcoin swap and WBTC deposit)
 * - Receiving Bitcoin payments (Bitcoin → Starknet swap, returns deposit address)
 */
export class BitcoinPaymentService {
  constructor(
    private readonly deps: BitcoinPaymentServiceDeps
  ) {}

  // ===========================================================================
  // PARSE
  // ===========================================================================

  /**
   * Parse a BIP-21 Bitcoin URI.
   *
   * Format: bitcoin:<address>[?amount=<btc_decimal>&label=<name>&message=<note>]
   *
   * @see https://github.com/bitcoin/bips/blob/master/bip-0021.mediawiki
   *
   * @throws InvalidPaymentAddressError if the address format is invalid
   * @throws MissingPaymentAmountError if the amount parameter is absent
   */
  parse(uri: string): ParsedPaymentData & {network: 'bitcoin'} {
    const url = new URL(uri);
    const address = BitcoinAddress.of(url.pathname);

    const amountParam = url.searchParams.get('amount');
    if (amountParam == undefined) {
      throw new MissingPaymentAmountError('bitcoin');
    }
    const btcAmount = Number.parseFloat(amountParam);
    const rawSats = BigInt(Math.round(btcAmount * 100_000_000));
    const amount = Amount.ofSatoshi(rawSats);

    // BIP-21: "label" is for the recipient name, "message" is a note to the payer
    const description = url.searchParams.get('label')
      ?? url.searchParams.get('message')
      ?? '';

    return {
      network: 'bitcoin',
      address,
      amount,
      description,
    };
  }

  // ===========================================================================
  // PAY
  // ===========================================================================

  /**
   * Send BTC to a Bitcoin address. WBTC is debited from the user's Starknet
   * account and converted via a Starknet → Bitcoin swap.
   *
   * @throws InvalidPaymentAmountError if amount <= 0
   * @throws SwapAmountError if amount is outside swap limits
   * @throws SwapCreationError if swap creation fails
   */
  async pay(input: PayBitcoinInput): Promise<BitcoinPaymentResult> {
    if (!input.amount.isPositive()) {
      throw new InvalidPaymentAmountError('bitcoin', input.amount.getSat());
    }

    const swapResult = await this.deps.swapService.createStarknetToBitcoin({
      amount: input.amount,
      destinationAddress: input.address,
      sourceAddress: input.senderAddress,
    });

    const depositAddress = StarknetAddress.of(swapResult.depositAddress);

    const {txHash} = await this.executeDeposit({
      senderAddress: input.senderAddress,
      depositAddress,
      amount: input.amount,
    });

    return {
      txHash,
      swapId: swapResult.swap.id,
      amount: input.amount,
      destinationAddress: input.address,
      expiresAt: swapResult.swap.expiresAt,
    };
  }

  // ===========================================================================
  // RECEIVE
  // ===========================================================================

  /**
   * Receive a Bitcoin payment. A deposit address is generated for the payer,
   * and funds arrive as WBTC on the user's Starknet account.
   *
   * @throws InvalidPaymentAmountError if amount <= 0
   * @throws SwapAmountError if amount is outside swap limits
   * @throws SwapCreationError if deposit address generation fails
   */
  async receive(input: ReceiveBitcoinInput): Promise<BitcoinReceiveResult> {
    if (!input.amount.isPositive()) {
      throw new InvalidPaymentAmountError('bitcoin', input.amount.getSat());
    }

    const result = await this.deps.swapService.createBitcoinToStarknet({
      amount: input.amount,
      destinationAddress: input.destinationAddress,
    });

    return {
      swapId: result.swap.id,
      depositAddress: BitcoinAddress.of(result.depositAddress),
      bip21Uri: result.bip21Uri,
      amount: input.amount,
      expiresAt: result.swap.expiresAt,
    };
  }

  // ===========================================================================
  // Private
  // ===========================================================================

  private async executeDeposit(params: {
    senderAddress: StarknetAddress;
    depositAddress: StarknetAddress;
    amount: Amount;
  }): Promise<{txHash: string}> {
    const {calls} = this.deps.erc20CallFactory.createTransfer({
      tokenAddress: this.deps.starknetConfig.wbtcTokenAddress,
      recipientAddress: params.depositAddress,
      amount: params.amount,
      applyFee: false,
    });

    return this.deps.starknetGateway.executeCalls({
      senderAddress: params.senderAddress,
      calls,
    });
  }
}
