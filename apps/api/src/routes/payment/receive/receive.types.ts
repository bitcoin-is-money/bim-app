
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

/**
 * Bitcoin receive requires a two-phase flow:
 * Phase 1 (POST /receive): Returns commit data for WebAuthn signing.
 * Phase 2 (POST /receive/commit): After signing, returns the deposit address.
 */
export interface BitcoinReceivePendingCommitResponse {
  network: 'bitcoin';
  status: 'pending_commit';
  buildId: string;
  messageHash: string;
  credentialId: string;
  swapId: string;
  amount: { value: number; currency: string };
  expiresAt: string;
}

// =============================================================================
// POST /api/receive/commit
// =============================================================================

export type BitcoinReceiveCommitResponse = BitcoinReceiveResponse;

// =============================================================================
// Union types
// =============================================================================

export type ReceiveResponse =
  | StarknetReceiveResponse
  | LightningReceiveResponse
  | BitcoinReceiveResponse
  | BitcoinReceivePendingCommitResponse;
