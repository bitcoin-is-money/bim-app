import {Amount} from '../shared';
import {LightningInvoice, type SwapId, type SwapService} from '../swap';
import type {BitcoinPaymentService} from './bitcoin-payment.service';
import {FeeCalculator, type FeeConfig} from './fee';
import type {LightningPaymentService} from './lightning-payment.service';
import type {StarknetPaymentService} from './starknet-payment.service';
import {
  type ExecutePaymentInput,
  type ParsedPaymentData,
  PaymentParsingError,
  type PaymentResult,
  type PaymentStatusResult,
  type PreparedPayment,
  UnsupportedNetworkError,
} from './types';

// =============================================================================
// Dependencies
// =============================================================================

export interface PaymentServiceDeps {
  starknet: StarknetPaymentService;
  lightning: LightningPaymentService;
  bitcoin: BitcoinPaymentService;
  swapService: SwapService;
  feeConfig: FeeConfig;
}

// =============================================================================
// Service Class (Facade)
// =============================================================================

/**
 * Payment service facade.
 *
 * Exposes network-specific sub-services and provides cross-cutting operations:
 * - `parse()`: auto-detects the payment network and delegates to the right sub-service
 * - `prepare()`: parse + fee calculation (used by the API layer)
 * - `getStatus()`: polls swap status for Lightning/Bitcoin payments
 *
 * Network-specific operations are accessed via sub-service properties:
 * - `starknet.pay()`, `starknet.receive()`, `starknet.parse()`
 * - `lightning.pay()`, `lightning.receive()`, `lightning.parse()`
 * - `bitcoin.pay()`, `bitcoin.receive()`, `bitcoin.parse()`
 */
export class PaymentService {
  readonly starknet: StarknetPaymentService;
  readonly lightning: LightningPaymentService;
  readonly bitcoin: BitcoinPaymentService;

  constructor(private readonly deps: PaymentServiceDeps) {
    this.starknet = deps.starknet;
    this.lightning = deps.lightning;
    this.bitcoin = deps.bitcoin;
  }

  // ===========================================================================
  // PARSE (auto-detect network)
  // ===========================================================================

  /**
   * Parse any payment data (QR code, invoice, address).
   * Auto-detects the payment network and delegates to the appropriate sub-service.
   *
   * @throws UnsupportedNetworkError if the input format is not recognized
   * @throws PaymentParsingError if network-specific parsing fails
   */
  parse(data: string): ParsedPaymentData {
    const trimmed = data.trim();
    const parseFn = this.resolveParser(trimmed);

    try {
      return parseFn();
    } catch (error: unknown) {
      const cause = error instanceof Error
        ? error
        : new Error(String(error));
      throw new PaymentParsingError(cause);
    }
  }

  // ===========================================================================
  // PREPARE (parse + fee calculation)
  // ===========================================================================

  /**
   * Parse payment data and calculate the applicable fee.
   *
   * BIM fee is applied only to Starknet direct transfers.
   * Lightning and Bitcoin swaps have no BIM fee (swap fees are handled by Atomiq).
   */
  prepare(data: string): PreparedPayment {
    const parsed = this.parse(data);
    const fee = parsed.network === 'starknet'
      ? FeeCalculator.calculateFee(parsed.amount, this.deps.feeConfig.percentage)
      : Amount.zero();
    return {...parsed, fee};
  }

  // ===========================================================================
  // EXECUTE (parse + pay)
  // ===========================================================================

  /**
   * Execute a payment: auto-detect the network, then delegate to the
   * appropriate sub-service's `pay()` method.
   *
   * @throws UnsupportedNetworkError if the input format is not recognized
   * @throws PaymentParsingError if network-specific parsing fails
   * @throws InvalidPaymentAmountError if amount <= 0
   * @throws SameAddressPaymentError if sender === recipient (Starknet)
   */
  async execute(input: ExecutePaymentInput): Promise<PaymentResult> {
    const parsed = this.parse(input.data);

    switch (parsed.network) {
      case 'starknet':
        return {
          network: 'starknet',
          ...(await this.deps.starknet.pay({
            senderAddress: input.senderAddress,
            recipientAddress: parsed.address,
            tokenAddress: parsed.tokenAddress,
            amount: parsed.amount,
          })),
        };
      case 'lightning':
        return {
          network: 'lightning',
          ...(await this.deps.lightning.pay({
            invoice: parsed.invoice,
            senderAddress: input.senderAddress,
          })),
        };
      case 'bitcoin':
        return {
          network: 'bitcoin',
          ...(await this.deps.bitcoin.pay({
            address: parsed.address,
            amount: parsed.amount,
            senderAddress: input.senderAddress,
          })),
        };
    }
  }

  // ===========================================================================
  // STATUS (for swap-based payments)
  // ===========================================================================

  /**
   * Get the status of a swap-based payment (Lightning or Bitcoin).
   *
   * @throws SwapNotFoundError if swap doesn't exist
   */
  async getStatus(swapId: SwapId): Promise<PaymentStatusResult> {
    const result = await this.deps.swapService.fetchStatus({swapId});

    return {
      status: result.status,
      progress: result.progress,
      txHash: result.txHash,
    };
  }

  // ===========================================================================
  // Private
  // ===========================================================================

  private resolveParser(data: string): () => ParsedPaymentData {
    if (LightningInvoice.isValid(data))
      return () => this.deps.lightning.parse(data);
    if (data.toLowerCase().startsWith('bitcoin:'))
      return () => this.deps.bitcoin.parse(data);
    if (data.toLowerCase().startsWith('starknet:'))
      return () => this.deps.starknet.parse(data);
    throw new UnsupportedNetworkError(data);
  }
}
