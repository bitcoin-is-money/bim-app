import {STRK_DECIMALS, WBTC_DECIMALS} from '../config/constants.js';

export function formatToken(amount: bigint, decimals: number, symbol: string): string {
  const whole = amount / 10n ** BigInt(decimals);
  const fraction = amount % 10n ** BigInt(decimals);
  const fractionStr = fraction.toString().padStart(decimals, '0').slice(0, 6);
  return `${whole}.${fractionStr} ${symbol}`;
}

export function formatStrk(wei: bigint): string {
  return formatToken(wei, STRK_DECIMALS, 'STRK');
}

export function formatWbtc(sats: bigint): string {
  return formatToken(sats, WBTC_DECIMALS, 'WBTC');
}
