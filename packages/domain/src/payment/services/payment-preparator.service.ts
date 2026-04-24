import type {Logger} from 'pino';
import type {Amount} from '../../shared';
import type {SwapReader} from '../../swap';
import {FeeCalculator, type FeeConfig} from '../fee';
import type {PreparedPaymentData} from '../pay.types';
import type {ParsedPaymentData} from '../types';
import type {
  PreparePaymentInput,
  PreparePaymentUseCase,
} from '../use-cases/prepare-payment.use-case';
import type {PaymentParser} from './payment-parser.service';

export interface PaymentPreparatorDeps {
  paymentParser: PaymentParser;
  swapReader: SwapReader;
  feeConfig: FeeConfig;
  logger: Logger;
}

/**
 * Parse payment data and calculate the applicable fee for display.
 *
 * - Starknet direct transfers: BIM fee (configured percentage).
 * - Lightning/Bitcoin swaps: estimated LP fee (from Atomiq rates) + BIM fee.
 */
export class PaymentPreparator implements PreparePaymentUseCase {
  private readonly log: Logger;

  constructor(private readonly deps: PaymentPreparatorDeps) {
    this.log = deps.logger.child({name: 'payment-preparator.service.ts'});
  }

  async prepare(input: PreparePaymentInput): Promise<PreparedPaymentData> {
    const parsed: ParsedPaymentData = typeof input === 'string'
      ? this.deps.paymentParser.parse(input)
      : input;

    let fee: Amount;
    switch (parsed.network) {
      case 'starknet':
        fee = FeeCalculator.calculateFee(parsed.amount, this.deps.feeConfig.percentageFor('starknet'));
        break;
      case 'lightning': {
        const limits = await this.deps.swapReader.fetchLimits({direction: 'starknet_to_lightning'});
        const lpFeeEstimate = FeeCalculator.calculateFee(parsed.amount, limits.limits.feePercent / 100);
        const bimFeeLn = FeeCalculator.calculateFee(parsed.amount, this.deps.feeConfig.percentageFor('lightning'));
        fee = lpFeeEstimate.add(bimFeeLn);
        break;
      }
      case 'bitcoin': {
        const limits = await this.deps.swapReader.fetchLimits({direction: 'starknet_to_bitcoin'});
        const lpFeeEstimate = FeeCalculator.calculateFee(parsed.amount, limits.limits.feePercent / 100);
        const bimFeeBtc = FeeCalculator.calculateFee(parsed.amount, this.deps.feeConfig.percentageFor('bitcoin'));
        fee = lpFeeEstimate.add(bimFeeBtc);
        break;
      }
    }

    this.log.debug({network: parsed.network, fee: fee.getSat()}, 'Payment prepared');
    return {...parsed, fee};
  }
}
