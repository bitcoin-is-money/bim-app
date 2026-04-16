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
  /**
   * When set, the unit symbol is appended as ` {displayUnit}` at the end
   * (e.g. `"1.000000 STRK"`). Defaults to no unit.
   */
  displayUnit?: string;
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
  const {fractionDigits = decimals, omitZeroFraction = false, displayUnit} = options;
  const raw = typeof rawAmount === 'bigint' ? rawAmount : BigInt(rawAmount);
  const divisor = 10n ** BigInt(decimals);
  const whole = (raw / divisor).toString();
  const number = computeFormattedNumber(raw, divisor, decimals, whole, fractionDigits, omitZeroFraction);
  return displayUnit ? `${number} ${displayUnit}` : number;
}

function computeFormattedNumber(
  raw: bigint,
  divisor: bigint,
  decimals: number,
  whole: string,
  fractionDigits: number,
  omitZeroFraction: boolean,
): string {
  if (fractionDigits <= 0) return whole;
  const fractionStr = (raw % divisor).toString().padStart(decimals, '0');
  const displayed = fractionStr.slice(0, fractionDigits).padEnd(fractionDigits, '0');
  if (omitZeroFraction && /^0+$/.test(displayed)) return whole;
  return `${whole}.${displayed}`;
}

const STRK_DECIMALS = 18;
const WBTC_DECIMALS = 8;

/**
 * Formats a STRK amount (wei, 18 decimals) to a 6-fraction-digit string.
 * Pass `withUnit = true` to append ` STRK`.
 */
export function formatStrk(wei: bigint, withUnit = false): string {
  return formatTokenAmount(wei, STRK_DECIMALS, {
    fractionDigits: 6,
    ...(withUnit && {displayUnit: 'STRK'}),
  });
}

/**
 * Formats a WBTC amount (sats, 8 decimals) to a full 8-fraction-digit string.
 * Pass `withUnit = true` to append ` WBTC`.
 */
export function formatWbtc(sats: bigint, withUnit = false): string {
  return formatTokenAmount(sats, WBTC_DECIMALS, {
    fractionDigits: 8,
    ...(withUnit && {displayUnit: 'WBTC'}),
  });
}

/**
 * Formats a satoshi amount as a plain integer string.
 * Pass `withUnit = true` to append ` sats`.
 */
export function formatSats(sats: bigint, withUnit = false): string {
  return formatTokenAmount(sats, 0, {
    ...(withUnit && {displayUnit: 'sats'}),
  });
}
