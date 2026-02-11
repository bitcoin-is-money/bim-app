/**
 * Normalize Starknet felt to a 0x-prefixed, 66-char lowercase hex string.
 */
export function normalizeAddress(felt: string | bigint): string {
  const hex =
    typeof felt === 'bigint'
      ? felt.toString(16)
      : felt.replace(/^0x/i, '');
  return '0x' + hex.padStart(64, '0').toLowerCase();
}

/**
 * Decode a Cairo u256 from two felt values (low, high).
 */
export function decodeU256(
  low: string | bigint,
  high: string | bigint
): string {
  const lo = BigInt(low ?? 0);
  const hi = BigInt(high ?? 0);
  return (lo + (hi << 128n)).toString();
}
