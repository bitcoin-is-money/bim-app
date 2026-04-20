import type {PreparedPaymentData} from '../pay.types';
import type {ParsedPaymentData} from '../types';

/**
 * Parses payment data and calculates the applicable fee.
 */
export interface PreparePaymentUseCase {
  prepare(input: string | ParsedPaymentData): Promise<PreparedPaymentData>;
}
