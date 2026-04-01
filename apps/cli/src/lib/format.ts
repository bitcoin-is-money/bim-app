import {STRK_DECIMALS, WBTC_DECIMALS} from '../config/constants.js';

export function formatToken(
  amount: bigint,
  decimals: number,
  symbol: string,
  displayDecimals?: number,
): string {
  const whole = amount / 10n ** BigInt(decimals);
  const fraction = amount % 10n ** BigInt(decimals);
  const fractionStr = fraction.toString().padStart(decimals, '0');
  const trimmed = displayDecimals !== undefined ? fractionStr.slice(0, displayDecimals) : fractionStr;
  return `${whole}.${trimmed} ${symbol}`;
}

export function formatStrk(wei: bigint): string {
  return formatToken(wei, STRK_DECIMALS, 'STRK', 6);
}

export function formatWbtc(sats: bigint): string {
  return `${sats} sats (${formatToken(sats, WBTC_DECIMALS, 'WBTC')})`;
}
