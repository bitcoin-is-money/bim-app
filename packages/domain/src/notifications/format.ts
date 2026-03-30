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
  const whole = wei / 10n ** BigInt(STRK_DECIMALS);
  const fraction = wei % 10n ** BigInt(STRK_DECIMALS);
  const fractionStr = fraction.toString().padStart(STRK_DECIMALS, '0').slice(0, 6);
  return `${whole}.${fractionStr}`;
}
