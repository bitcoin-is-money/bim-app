import {formatTokenAmount} from '@bim/lib/token';
import type {StarknetAddress} from '../shared';

const STARKSCAN_MAINNET = 'https://starkscan.co/contract';
const STARKSCAN_TESTNET = 'https://testnet.starkscan.co/contract';

export function starkscanUrl(address: StarknetAddress, network: string): string {
  const base = network === 'mainnet' ? STARKSCAN_MAINNET : STARKSCAN_TESTNET;
  return `${base}/${address}`;
}

export function truncateAddress(address: string): string {
  return `${address.slice(0, 8)}...${address.slice(-4)}`;
}

const STRK_DECIMALS = 18;

export function formatStrk(wei: bigint): string {
  return formatTokenAmount(wei, STRK_DECIMALS, {fractionDigits: 6});
}
