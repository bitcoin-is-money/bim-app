import {formatStrk} from '@bim/lib/token';

export function formatAvnuCredits(wei: bigint | undefined): string {
  if (wei === undefined) return 'N/A';
  return formatStrk(wei);
}

export function formatUsd(amount: number): string {
  return `$${amount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
}

export function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}
