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
 *
 * Note: `execute` is the domain verb here — we literally "execute" a
 * previously-signed payment on-chain.
 */
export interface ExecutePaymentUseCase {
  execute(input: ExecutePaymentInput): Promise<ExecutePaymentOutput>;
}
