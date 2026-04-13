import {STRK_DECIMALS} from '../config/constants.js';

export function formatToken(
  amount: bigint,
  decimals: number,
  symbol: string,
  displayDecimals?: number,
): string {
  const whole = amount / 10n ** BigInt(decimals);
  const fraction = amount % 10n ** BigInt(decimals);
  const fractionStr = fraction.toString().padStart(decimals, '0');
  const trimmed = displayDecimals === undefined ? fractionStr : fractionStr.slice(0, displayDecimals);
  return `${whole}.${trimmed} ${symbol}`;
}

export function formatStrk(wei: bigint): string {
  return formatToken(wei, STRK_DECIMALS, 'STRK', 6);
}

export function formatWbtc(sats: bigint): string {
  return `${sats} sats`;
}

export function formatAvnuCredits(wei: bigint | undefined): string {
  if (wei === undefined) return 'N/A';
  return (Number(wei) / 1e18).toFixed(6);
}

export function formatUsd(amount: number): string {
  return `$${amount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
}

export function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}
