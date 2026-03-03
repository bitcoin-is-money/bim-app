import type {Logger} from 'pino';
import {AccountId, StarknetAddress} from '../account';
import type {StarknetGateway, TransactionRepository} from '../ports';
import {Amount, type StarknetConfig} from '../shared';
import type {SwapService} from '../swap';
import {TransactionHash} from '../user/types';
import type {Erc20CallFactory} from './erc20-call.factory';
import {FeeCalculator, type FeeConfig} from './fee';
import type {ParseService} from './parse.service';
import {InvalidPaymentAmountError, SameAddressPaymentError} from './errors';
import type {PreparedCalls, PreparedPayment} from './pay.types';
import type {ParsedPaymentData} from './types';

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
 * - `prepare()`: parse + fee calculation (for display)
 * - `prepareCalls()`: parse + create Starknet calls (for SNIP-29 build step)
 * - `savePaymentResult()`: persist transaction metadata after execution
 */
export class PayService {
  private readonly log: Logger;

  constructor(private readonly deps: PayServiceDeps) {
    this.log = deps.logger.child({name: 'pay.service.ts'});
  }

  // ===========================================================================
  // PREPARE (parse + fee calculation, for display)
  // ===========================================================================

  /**
   * Parse payment data and calculate the applicable fee.
   *
   * - Starknet direct transfers: BIM fee (configured percentage).
   * - Lightning/Bitcoin swaps: estimated fee from Atomiq intermediary rates.
   */
  async prepare(paymentPayload: string): Promise<PreparedPayment> {
    const parsed = this.deps.parseService.parse(paymentPayload);

    let fee: Amount;
    switch (parsed.network) {
      case 'starknet':
        fee = FeeCalculator.calculateFee(parsed.amount, this.deps.feeConfig.percentage);
        break;
      case 'lightning': {
        const limits = await this.deps.swapService.fetchLimits({direction: 'starknet_to_lightning'});
        fee = FeeCalculator.calculateFee(parsed.amount, limits.limits.feePercent / 100);
        break;
      }
      case 'bitcoin': {
        const limits = await this.deps.swapService.fetchLimits({direction: 'starknet_to_bitcoin'});
        fee = FeeCalculator.calculateFee(parsed.amount, limits.limits.feePercent / 100);
        break;
      }
    }

    return {...parsed, fee};
  }

  // ===========================================================================
  // PREPARE CALLS (parse + create Starknet calls for SNIP-29 build)
  // ===========================================================================

  /**
   * Parse payment data and create Starknet calls to execute.
   * For Lightning/Bitcoin, this also creates the swap (which has a timeout).
   *
   * Returns the calls + metadata needed for the execute step.
   */
  async prepareCalls(paymentPayload: string, senderAddress: StarknetAddress, accountId: string, description: string): Promise<PreparedCalls> {
    this.log.info({paymentPayload, senderAddress: senderAddress.toString()}, 'Preparing payment calls');
    const parsed = this.deps.parseService.parse(paymentPayload);

    switch (parsed.network) {
      case 'starknet':
        return this.prepareStarknetCalls(senderAddress, parsed);
      case 'lightning':
        return this.prepareLightningCalls(senderAddress, parsed, accountId, description);
      case 'bitcoin':
        return this.prepareBitcoinCalls(senderAddress, parsed, accountId, description);
    }
  }

  private prepareStarknetCalls(
    senderAddress: StarknetAddress,
    parsed: Extract<ParsedPaymentData, {network: 'starknet'}>,
  ): PreparedCalls {
    if (!parsed.amount.isPositive()) {
      throw new InvalidPaymentAmountError('starknet', parsed.amount.getSat());
    }
    if (senderAddress.toString() === parsed.address.toString()) {
      throw new SameAddressPaymentError();
    }

    const {calls, feeAmount} = this.deps.erc20CallFactory.createTransfer({
      tokenAddress: parsed.tokenAddress,
      recipientAddress: parsed.address.toString(),
      amount: parsed.amount,
      applyFee: true,
    });

    return {
      network: 'starknet',
      calls,
      amount: parsed.amount,
      feeAmount,
      recipientAddress: parsed.address,
      tokenAddress: parsed.tokenAddress,
    };
  }

  private async prepareLightningCalls(
    senderAddress: StarknetAddress,
    parsed: Extract<ParsedPaymentData, {network: 'lightning'}>,
    accountId: string,
    description: string,
  ): Promise<PreparedCalls> {
    const swapResult = await this.deps.swapService.createStarknetToLightning({
      invoice: parsed.invoice,
      sourceAddress: senderAddress,
      accountId,
      description,
    });

    return {
      network: 'lightning',
      calls: swapResult.commitCalls,
      amount: swapResult.amount,
      swapId: swapResult.swap.id,
      invoice: parsed.invoice,
      expiresAt: swapResult.swap.expiresAt,
    };
  }

  private async prepareBitcoinCalls(
    senderAddress: StarknetAddress,
    parsed: Extract<ParsedPaymentData, {network: 'bitcoin'}>,
    accountId: string,
    description: string,
  ): Promise<PreparedCalls> {
    if (!parsed.amount.isPositive()) {
      throw new InvalidPaymentAmountError('bitcoin', parsed.amount.getSat());
    }

    const swapResult = await this.deps.swapService.createStarknetToBitcoin({
      amount: parsed.amount,
      destinationAddress: parsed.address,
      sourceAddress: senderAddress,
      accountId,
      description,
    });

    return {
      network: 'bitcoin',
      calls: swapResult.commitCalls,
      amount: parsed.amount,
      swapId: swapResult.swap.id,
      destinationAddress: parsed.address,
      expiresAt: swapResult.swap.expiresAt,
    };
  }

  // ===========================================================================
  // SAVE RESULT (persist transaction metadata after execute)
  // ===========================================================================

  async savePaymentResult(params: {
    txHash: string;
    accountId: string;
    description: string;
  }): Promise<void> {
    await this.deps.transactionRepository.saveDescription(
      TransactionHash.of(params.txHash),
      AccountId.of(params.accountId),
      params.description,
    );
  }

}
