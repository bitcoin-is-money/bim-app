import type {Account} from '../../account';
import type {Amount} from '../../shared';
import type {PreparedPaymentData} from '../pay.types';

export interface BuildPaymentInput {
  paymentPayload: string;
  description?: string | undefined;
  account: Account;
}

export interface BuildPaymentOutput {
  buildId: string;
  messageHash: string;
  credentialId: string;
  prepared: PreparedPaymentData;
  feeAmount: Amount;
}

/**
 * Parses, prepares calls, builds typed data, and caches a payment for execution.
 */
export interface BuildPaymentUseCase {
  buildPayment(input: BuildPaymentInput): Promise<BuildPaymentOutput>;
}
