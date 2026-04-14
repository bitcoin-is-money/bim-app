export interface FormatTokenAmountOptions {
  /**
   * Number of fraction digits to display. Defaults to `decimals`.
   * When smaller than `decimals`, the fraction is truncated (not rounded).
   */
  fractionDigits?: number;
  /**
   * When the displayed fraction is entirely zero, omit it and the dot.
   * Non-leading and trailing zeros inside a non-zero fraction are preserved
   * (e.g. `"66.40"` stays `"66.40"`). Defaults to `false`.
   */
  omitZeroFraction?: boolean;
}

/**
 * Formats a raw token amount (e.g. wei, raw on-chain uint256) into a
 * human-readable decimal string. Uses bigint arithmetic end-to-end,
 * so it is safe for values that exceed `Number.MAX_SAFE_INTEGER`.
 */
export function formatTokenAmount(
  rawAmount: bigint | string,
  decimals: number,
  options: FormatTokenAmountOptions = {},
): string {
  const {fractionDigits = decimals, omitZeroFraction = false} = options;
  const raw = typeof rawAmount === 'bigint' ? rawAmount : BigInt(rawAmount);
  const divisor = 10n ** BigInt(decimals);
  const whole = (raw / divisor).toString();
  if (fractionDigits <= 0) return whole;
  const fractionStr = (raw % divisor).toString().padStart(decimals, '0');
  const displayed = fractionStr.slice(0, fractionDigits).padEnd(fractionDigits, '0');
  if (omitZeroFraction && /^0+$/.test(displayed)) return whole;
  return `${whole}.${displayed}`;
}
