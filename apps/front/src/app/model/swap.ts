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

export function isTerminalStatus(status: SwapStatus, direction?: SwapDirection): boolean {
  if (status === 'expired' && direction === 'bitcoin_to_starknet') {
    return false;
  }
  return ['completed', 'expired', 'refunded', 'failed', 'lost'].includes(status);
}
