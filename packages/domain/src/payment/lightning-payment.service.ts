import {StarknetAddress} from '../account';
import type {LightningDecoder, StarknetGateway} from '../ports';
import {Amount, type StarknetConfig} from '../shared';
import {LightningInvoice, type SwapService} from '../swap';
import type {Erc20CallFactory} from './erc20-call.factory';
import {
  InvalidPaymentAmountError,
  type LightningPaymentResult,
  type LightningReceiveResult,
  MissingPaymentAmountError,
  type ParsedPaymentData,
  type PayLightningInput,
  type ReceiveLightningInput,
} from './types';

// =============================================================================
// Dependencies
// =============================================================================

export interface LightningPaymentServiceDeps {
  swapService: SwapService;
  starknetGateway: StarknetGateway;
  starknetConfig: StarknetConfig;
  erc20CallFactory: Erc20CallFactory;
  lightningDecoder: LightningDecoder;
}

// =============================================================================
// Service
// =============================================================================

/**
 * Lightning-specific payment service.
 *
 * Handles:
 * - Parsing BOLT11 Lightning invoices
 * - Paying Lightning invoices (Starknet → Lightning swap + WBTC deposit)
 * - Receiving Lightning payments (Lightning → Starknet swap, returns invoice)
 */
export class LightningPaymentService {
  constructor(
    private readonly deps: LightningPaymentServiceDeps
  ) {}

  // ===========================================================================
  // PARSE
  // ===========================================================================

  /**
   * Parse a BOLT11 Lightning invoice.
   *
   * @throws MissingPaymentAmountError if the invoice has no amount
   */
  parse(invoice: string): ParsedPaymentData & {network: 'lightning'} {
    const lightningInvoice = LightningInvoice.of(invoice);
    const decoded = this.deps.lightningDecoder.decode(lightningInvoice);

    if (decoded.amountMSat == undefined) {
      throw new MissingPaymentAmountError('lightning');
    }

    const amount = Amount.ofMilliSatoshi(decoded.amountMSat);
    return {
      network: 'lightning',
      invoice: lightningInvoice,
      amount,
      description: decoded.description ?? '',
      expiresAt: decoded.expiresAt,
    };
  }

  // ===========================================================================
  // PAY
  // ===========================================================================

  /**
   * Pay a Lightning invoice. WBTC is debited from the user's Starknet account
   * and converted via a Starknet → Lightning swap.
   *
   * @throws SwapAmountError if invoice amount is outside limits
   * @throws SwapCreationError if swap creation fails
   */
  async pay(input: PayLightningInput): Promise<LightningPaymentResult> {
    const swapResult = await this.deps.swapService.createStarknetToLightning({
      invoice: input.invoice,
      sourceAddress: input.senderAddress,
    });

    const depositAddress = StarknetAddress.of(swapResult.depositAddress);

    const {txHash} = await this.executeDeposit({
      senderAddress: input.senderAddress,
      depositAddress,
      amount: swapResult.amount,
    });

    return {
      txHash,
      swapId: swapResult.swap.id,
      invoice: input.invoice,
      amount: swapResult.amount,
      expiresAt: swapResult.swap.expiresAt,
    };
  }

  // ===========================================================================
  // RECEIVE
  // ===========================================================================

  /**
   * Receive a Lightning payment. An invoice is generated for the payer,
   * and funds arrive as WBTC on the user's Starknet account.
   *
   * @throws InvalidPaymentAmountError if amount <= 0
   * @throws SwapAmountError if amount is outside swap limits
   * @throws SwapCreationError if invoice generation fails
   */
  async receive(input: ReceiveLightningInput): Promise<LightningReceiveResult> {
    if (!input.amount.isPositive()) {
      throw new InvalidPaymentAmountError('lightning', input.amount.getSat());
    }

    const result = await this.deps.swapService.createLightningToStarknet({
      amount: input.amount,
      destinationAddress: input.destinationAddress,
    });

    return {
      swapId: result.swap.id,
      invoice: LightningInvoice.of(result.invoice),
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
