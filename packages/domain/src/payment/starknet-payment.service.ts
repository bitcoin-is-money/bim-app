import {StarknetAddress} from '../account';
import type {StarknetGateway} from '../ports';
import {Amount, type StarknetConfig} from '../shared';
import type {Erc20CallFactory} from './erc20-call.factory';
import {
  InvalidPaymentAddressError,
  InvalidPaymentAmountError,
  MissingPaymentAmountError,
  type ParsedPaymentData,
  type PayStarknetInput,
  type ReceiveStarknetInput,
  SameAddressPaymentError,
  type StarknetPaymentResult,
  type StarknetReceiveResult,
  UnsupportedTokenError,
} from './types';

// =============================================================================
// Dependencies
// =============================================================================

export interface StarknetPaymentServiceDeps {
  starknetGateway: StarknetGateway;
  starknetConfig: StarknetConfig;
  erc20CallFactory: Erc20CallFactory;
}

// =============================================================================
// Service
// =============================================================================

/**
 * Starknet-specific payment service.
 *
 * Handles:
 * - Parsing `starknet:` URIs
 * - Direct ERC-20 token transfers (pay)
 * - Generating `starknet:` URIs for receive requests (receive)
 */
export class StarknetPaymentService {
  constructor(
    private readonly deps: StarknetPaymentServiceDeps
  ) {}

  // ===========================================================================
  // PARSE
  // ===========================================================================

  /**
   * Parse a `starknet:` URI.
   *
   * Format: starknet:<address>[?amount=<raw_token_units>&token=<token_address>]
   *
   * @see https://eips.ethereum.org/EIPS/eip-681 (ERC-681: URL Format for Transaction Requests)
   *
   * @throws InvalidPaymentAddressError if the address format is invalid
   * @throws MissingPaymentAmountError if the amount parameter is absent
   * @throws UnsupportedTokenError if the token is not supported
   */
  parse(uri: string): ParsedPaymentData & {network: 'starknet'} {
    const url = new URL(uri);
    const address = StarknetAddress.of(url.pathname)

    const amountParam = url.searchParams.get('amount');
    if (amountParam == undefined) {
      throw new MissingPaymentAmountError('starknet');
    }
    const rawAmount = BigInt(amountParam);
    const amount = Amount.ofSatoshi(rawAmount);

    const tokenParam = url.searchParams.get('token');
    const wbtcAddress = this.deps.starknetConfig.wbtcTokenAddress;
    if (tokenParam == undefined || tokenParam !== wbtcAddress) {
      throw new UnsupportedTokenError(tokenParam ?? 'undefined');
    }

    // ERC-1138 proposed extension: summary, description, context (priority order)
    const description = url.searchParams.get('summary')
      ?? url.searchParams.get('description')
      ?? url.searchParams.get('context')
      ?? '';

    return {
      network: 'starknet',
      address,
      amount,
      tokenAddress: wbtcAddress,
      description,
    };
  }

  // ===========================================================================
  // PAY
  // ===========================================================================

  /**
   * Send tokens (WBTC/ETH/STRK) from a Starknet account to another Starknet address.
   *
   * Builds ERC-20 transfer call(s) and submits the transaction.
   *
   * @throws InvalidPaymentAmountError if amount <= 0
   * @throws SameAddressPaymentError if sender === recipient
   */
  async pay(input: PayStarknetInput): Promise<StarknetPaymentResult> {
    if (!input.amount.isPositive()) {
      throw new InvalidPaymentAmountError('starknet', input.amount.getSat());
    }

    if (input.senderAddress === input.recipientAddress) {
      throw new SameAddressPaymentError();
    }

    const {calls, feeAmount} = this.deps.erc20CallFactory.createTransfer({
      tokenAddress: input.tokenAddress,
      recipientAddress: input.recipientAddress,
      amount: input.amount,
      applyFee: true,
    });

    const {txHash} = await this.deps.starknetGateway.executeCalls({
      senderAddress: input.senderAddress,
      calls,
    });

    return {
      txHash,
      amount: input.amount,
      feeAmount,
      recipientAddress: input.recipientAddress,
      tokenAddress: input.tokenAddress,
    };
  }

  // ===========================================================================
  // RECEIVE
  // ===========================================================================

  /**
   * Generate a `starknet:` URI for receiving tokens directly on Starknet.
   *
   * The URI can be displayed as a QR code for the payer to scan.
   * When amount and token are provided, they are included in the URI.
   * When no amount is provided, the URI contains only the address (any-amount receive).
   */
  receive(input: ReceiveStarknetInput): StarknetReceiveResult {
    const address = input.starknetAddress;
    const uri = this.buildUri(address, input.amount, input.tokenAddress);

    return {address, uri};
  }

  // ===========================================================================
  // Private
  // ===========================================================================

  private buildUri(
    address: StarknetAddress,
    amount?: Amount,
    tokenAddress?: string,
  ): string {
    if (!amount) {
      return `starknet:${address}`;
    }

    const token = tokenAddress ?? this.deps.starknetConfig.wbtcTokenAddress;
    return `starknet:${address}?amount=${amount.toSatString()}&token=${token}`;
  }
}
