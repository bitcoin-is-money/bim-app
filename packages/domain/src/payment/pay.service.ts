import type {Logger} from 'pino';
import {AccountId} from '../account';
import type {StarknetGateway, TransactionRepository} from '../ports';
import {Amount, StarknetAddress, type StarknetConfig} from '../shared';
import type {SwapService} from '../swap';
import {TransactionHash} from '../user/types';
import type {Erc20CallFactory} from './erc20-call.factory';
import {FeeCalculator, FeeConfig} from './fee';
import type {ParseService} from './parse.service';
import {InvalidPaymentAmountError, SameAddressPaymentError} from './errors';
import type {PreparedCalls, PreparedPaymentData} from './pay.types';
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
  async prepare(input: string | ParsedPaymentData): Promise<PreparedPaymentData> {
    const parsed = typeof input === 'string' ? this.deps.parseService.parse(input) : input;

    let fee: Amount;
    switch (parsed.network) {
      case 'starknet':
        fee = FeeCalculator.calculateFee(parsed.amount, this.deps.feeConfig.percentageFor('starknet'));
        break;
      case 'lightning': {
        const limits = await this.deps.swapService.fetchLimits({direction: 'starknet_to_lightning'});
        const lpFeeEstimate = FeeCalculator.calculateFee(parsed.amount, limits.limits.feePercent / 100);
        const bimFeeLn = FeeCalculator.calculateFee(parsed.amount, this.deps.feeConfig.percentageFor('lightning'));
        fee = lpFeeEstimate.add(bimFeeLn);
        break;
      }
      case 'bitcoin': {
        const limits = await this.deps.swapService.fetchLimits({direction: 'starknet_to_bitcoin'});
        const lpFeeEstimate = FeeCalculator.calculateFee(parsed.amount, limits.limits.feePercent / 100);
        const bimFeeBtc = FeeCalculator.calculateFee(parsed.amount, this.deps.feeConfig.percentageFor('bitcoin'));
        fee = lpFeeEstimate.add(bimFeeBtc);
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
  async prepareCalls(parsed: ParsedPaymentData, senderAddress: StarknetAddress, accountId: string, description: string): Promise<PreparedCalls> {
    this.log.info({network: parsed.network, senderAddress: senderAddress.toString()}, 'Preparing payment calls');

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
      network: 'starknet',
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

    // BIM fee on the invoice amount (what the recipient receives)
    const {calls: feeCalls, feeAmount} = this.deps.erc20CallFactory.createFeeCall(
      this.deps.starknetConfig.wbtcTokenAddress,
      parsed.amount,
      'lightning',
    );

    return {
      network: 'lightning',
      calls: [...swapResult.commitCalls, ...feeCalls],
      amount: swapResult.amount,
      feeAmount,
      swapId: swapResult.swap.data.id,
      invoice: parsed.invoice,
      expiresAt: swapResult.swap.data.expiresAt,
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

    // BIM fee on the destination amount (what the recipient receives)
    const {calls: feeCalls, feeAmount} = this.deps.erc20CallFactory.createFeeCall(
      this.deps.starknetConfig.wbtcTokenAddress,
      parsed.amount,
      'bitcoin',
    );

    return {
      network: 'bitcoin',
      calls: [...swapResult.commitCalls, ...feeCalls],
      amount: parsed.amount,
      feeAmount,
      swapId: swapResult.swap.data.id,
      destinationAddress: parsed.address,
      expiresAt: swapResult.swap.data.expiresAt,
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
