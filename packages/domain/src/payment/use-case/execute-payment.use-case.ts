import type {Account} from '../../account';
import type {PaymentResult} from '../pay.types';
import type {WebAuthnAssertion} from '../types';

export interface ExecutePaymentInput {
  buildId: string;
  assertion: WebAuthnAssertion;
  account: Account;
}

export type ExecutePaymentOutput = PaymentResult;

/**
 * Executes a previously built payment: processes WebAuthn signature,
 * submits the transaction, and saves descriptions.
 */
export interface ExecutePaymentUseCase {
  executePayment(input: ExecutePaymentInput): Promise<ExecutePaymentOutput>;
}
