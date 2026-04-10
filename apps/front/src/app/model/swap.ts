export type SwapDirection =
  | 'lightning_to_starknet'
  | 'bitcoin_to_starknet'
  | 'starknet_to_lightning'
  | 'starknet_to_bitcoin';

export type SwapStatus =
  | 'pending'
  | 'paid'
  | 'claimable'
  | 'completed'
  | 'expired'
  | 'refundable'
  | 'refunded'
  | 'failed'
  | 'lost';

export type SwapType = 'receive' | 'send';

export interface StoredSwap {
  id: string;
  type: SwapType;
  direction: SwapDirection;
  amountSats: number;
  createdAt: string;
  lastKnownStatus: SwapStatus;
}

export interface SwapStatusResponse {
  swapId: string;
  direction: string;
  status: string;
  progress: number;
  txHash?: string;
  amountSats: string;
  destinationAddress: string;
  expiresAt: string;
}

export interface ActiveSwapsResponse {
  active: boolean;
  count: number;
}

export function isTerminalStatus(status: SwapStatus, direction?: SwapDirection): boolean {
  if (status === 'expired' && direction === 'bitcoin_to_starknet') {
    return false;
  }
  return ['completed', 'expired', 'refunded', 'failed', 'lost'].includes(status);
}

export function formatSwapDirection(direction: SwapDirection): string {
  const map: Record<SwapDirection, string> = {
    lightning_to_starknet: 'Lightning Receive',
    bitcoin_to_starknet: 'Bitcoin Receive',
    starknet_to_lightning: 'Lightning Send',
    starknet_to_bitcoin: 'Bitcoin Send',
  };
  // eslint-disable-next-line security/detect-object-injection -- key is SwapDirection union type
  return map[direction];
}

export function getSwapTypeFromDirection(direction: SwapDirection): SwapType {
  return direction.endsWith('_to_starknet') ? 'receive' : 'send';
}
