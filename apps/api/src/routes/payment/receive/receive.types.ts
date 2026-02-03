
// =============================================================================
// POST /api/receive
// =============================================================================

export interface StarknetReceiveResponse {
  network: 'starknet';
  address: string;
  uri: string;
}

export interface LightningReceiveResponse {
  network: 'lightning';
  swapId: string;
  invoice: string;
  amount: { value: number; currency: string };
  expiresAt: string;
}

export interface BitcoinReceiveResponse {
  network: 'bitcoin';
  swapId: string;
  depositAddress: string;
  bip21Uri: string;
  amount: { value: number; currency: string };
  expiresAt: string;
}

export type ReceiveResponse =
  | StarknetReceiveResponse
  | LightningReceiveResponse
  | BitcoinReceiveResponse;
