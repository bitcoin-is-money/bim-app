import type {PreparedPaymentData} from '../pay.types';
import type {ParsedPaymentData} from '../types';

/**
 * Input for PreparePayment.
 *
 * Accepts either a raw payment payload (string, from routes) or
 * already-parsed data (from internal callers that have run the parser).
 */
export type PreparePaymentInput = string | ParsedPaymentData;

/**
 * Parses payment data (if needed) and calculates the applicable fee.
 */
export interface PreparePaymentUseCase {
  prepare(input: PreparePaymentInput): Promise<PreparedPaymentData>;
}
