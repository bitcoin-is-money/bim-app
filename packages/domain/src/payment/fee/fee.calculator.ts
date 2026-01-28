import {Amount} from '../../shared';

/**
 * Pure fee calculation logic.
 *
 * Fees are calculated as a percentage of the transaction amount.
 */
export namespace FeeCalculator {
  /**
   * Calculates the fee amount for a given transaction amount.
   *
   * Uses Amount.percentage() which internally uses scaled integer arithmetic.
   *
   * @param amount - The transaction amount
   * @param percentage - Fee percentage as decimal (e.g., 0.001 for 0.1%)
   * @returns The fee Amount
   *
   * @example
   * // 0.1% fee on 50,000 sats
   * calculateFee(Amount.ofSatoshi(50_000n), 0.001) // => Amount of 50 sats
   */
  export function calculateFee(amount: Amount, percentage: number): Amount {
    if (!amount.isPositive()) {
      return Amount.zero();
    }
    if (percentage <= 0) {
      return Amount.zero();
    }
    return amount.percentage(percentage);
  }
}
