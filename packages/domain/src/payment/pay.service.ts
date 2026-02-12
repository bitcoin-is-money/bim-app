import {basename} from 'node:path';
import type {Logger} from 'pino';
import {AccountId, StarknetAddress} from '../account';
import type {StarknetGateway, TransactionRepository} from '../ports';
import {Amount, type StarknetConfig} from '../shared';
import type {SwapService} from '../swap';
import {TransactionHash} from '../user/types';
import type {Erc20CallFactory} from './erc20-call.factory';
import {FeeCalculator, type FeeConfig} from './fee';
import type {ParseService} from './parse.service';
import {
  type ExecutePaymentInput,
  InvalidPaymentAmountError,
  type ParsedPaymentData,
  type PaymentResult,
  type PreparedPayment,
  SameAddressPaymentError,
} from './types';

// =============================================================================
// Dependencies
// =============================================================================

export interface PayServiceDeps {
  parseService: ParseService;
  erc20CallFactory: Erc20CallFactory;
  starknetGateway: StarknetGateway;
  swapService: SwapService;
  transactionRepository: TransactionRepository;
  starknetConfig: StarknetConfig;
  feeConfig: FeeConfig;
  logger: Logger;
}

// =============================================================================
// Service Class
// =============================================================================

/**
 * Pay service — handles outgoing payments (send).
 *
 * Provides:
 * - `prepare()`: parse + fee calculation
 * - `execute()`: parse + execute payment on the detected network
 */
export class PayService {
  private readonly log: Logger;

  constructor(private readonly deps: PayServiceDeps) {
    this.log = deps.logger.child({name: basename(import.meta.filename)});
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
  prepare(paymentPayload: string): PreparedPayment {
    const parsed = this.deps.parseService.parse(paymentPayload);
    const fee = parsed.network === 'starknet'
      ? FeeCalculator.calculateFee(parsed.amount, this.deps.feeConfig.percentage)
      : Amount.zero();
    return {...parsed, fee};
  }

  // ===========================================================================
  // EXECUTE (parse + pay)
  // ===========================================================================

  /**
   * Execute a payment: auto-detect the network, then execute.
   *
   * @throws UnsupportedNetworkError if the input format is not recognized
   * @throws PaymentParsingError if network-specific parsing fails
   * @throws InvalidPaymentAmountError if amount <= 0
   * @throws SameAddressPaymentError if sender === recipient (Starknet)
   */
  async execute(input: ExecutePaymentInput): Promise<PaymentResult> {
    this.log.info(input, 'Executing payment');
    const parsed: ParsedPaymentData = this.deps.parseService.parse(input.paymentPayload);

    let result: PaymentResult;
    switch (parsed.network) {
      case 'starknet':
        result = {network: 'starknet', ...(await this.payStarknet(input, parsed))};
        break;
      case 'lightning':
        result = {network: 'lightning', ...(await this.payLightning(input, parsed))};
        break;
      case 'bitcoin':
        result = {network: 'bitcoin', ...(await this.payBitcoin(input, parsed))};
        break;
    }

    if (input.description && result.txHash) {
      await this.deps.transactionRepository.saveDescription(
        TransactionHash.of(result.txHash),
        AccountId.of(input.accountId),
        input.description,
      );
    }

    this.log.info({network: result.network, txHash: result.txHash}, 'Payment completed');
    return result;
  }

  // ===========================================================================
  // Starknet — direct ERC-20 transfer
  // ===========================================================================

  private async payStarknet(
    input: ExecutePaymentInput,
    parsed: Extract<ParsedPaymentData, {network: 'starknet'}>,
  ) {
    if (!parsed.amount.isPositive()) {
      throw new InvalidPaymentAmountError('starknet', parsed.amount.getSat());
    }
    if (input.senderAddress === parsed.address) {
      throw new SameAddressPaymentError();
    }

    const {calls, feeAmount} = this.deps.erc20CallFactory.createTransfer({
      tokenAddress: parsed.tokenAddress,
      recipientAddress: parsed.address,
      amount: parsed.amount,
      applyFee: true,
    });

    const {txHash} = await this.deps.starknetGateway.executeCalls({
      senderAddress: input.senderAddress,
      calls,
    });

    return {
      txHash,
      amount: parsed.amount,
      feeAmount,
      recipientAddress: parsed.address,
      tokenAddress: parsed.tokenAddress,
    };
  }

  // ===========================================================================
  // Lightning — Starknet → Lightning swap + WBTC deposit
  // ===========================================================================

  private async payLightning(
    input: ExecutePaymentInput,
    parsed: Extract<ParsedPaymentData, {network: 'lightning'}>,
  ) {
    const swapResult = await this.deps.swapService.createStarknetToLightning({
      invoice: parsed.invoice,
      sourceAddress: input.senderAddress,
    });

    const depositAddress = StarknetAddress.of(swapResult.depositAddress);
    const {txHash} = await this.executeDeposit(input.senderAddress, depositAddress, swapResult.amount);

    return {
      txHash,
      swapId: swapResult.swap.id,
      invoice: parsed.invoice,
      amount: swapResult.amount,
      expiresAt: swapResult.swap.expiresAt,
    };
  }

  // ===========================================================================
  // Bitcoin — Starknet → Bitcoin swap + WBTC deposit
  // ===========================================================================

  private async payBitcoin(
    input: ExecutePaymentInput,
    parsed: Extract<import('./types').ParsedPaymentData, {network: 'bitcoin'}>,
  ) {
    if (!parsed.amount.isPositive()) {
      throw new InvalidPaymentAmountError('bitcoin', parsed.amount.getSat());
    }

    const swapResult = await this.deps.swapService.createStarknetToBitcoin({
      amount: parsed.amount,
      destinationAddress: parsed.address,
      sourceAddress: input.senderAddress,
    });

    const depositAddress = StarknetAddress.of(swapResult.depositAddress);
    const {txHash} = await this.executeDeposit(input.senderAddress, depositAddress, parsed.amount);

    return {
      txHash,
      swapId: swapResult.swap.id,
      amount: parsed.amount,
      destinationAddress: parsed.address,
      expiresAt: swapResult.swap.expiresAt,
    };
  }

  // ===========================================================================
  // Shared helper — WBTC deposit for swap-based payments
  // ===========================================================================

  private async executeDeposit(
    senderAddress: StarknetAddress,
    depositAddress: StarknetAddress,
    amount: Amount,
  ): Promise<{txHash: string}> {
    const {calls} = this.deps.erc20CallFactory.createTransfer({
      tokenAddress: this.deps.starknetConfig.wbtcTokenAddress,
      recipientAddress: depositAddress,
      amount,
      applyFee: false,
    });

    return this.deps.starknetGateway.executeCalls({senderAddress, calls});
  }
}
