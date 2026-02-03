
// =============================================================================
// GET /api/swap/limits/:direction
// =============================================================================

export interface SwapLimitsResponse {
  minSats: string;
  maxSats: string;
  feePercent: number;
}

// =============================================================================
// GET /api/swap/status/:swapId
// =============================================================================

export interface SwapStatusResponse {
  swapId: string;
  direction: string;
  status: string;
  progress: number;
  txHash: string | undefined;
  amountSats: string;
  destinationAddress: string;
  expiresAt: string;
}

// =============================================================================
// POST /api/swap/claim/:swapId
// =============================================================================

export interface SwapClaimResponse {
  swapId: string;
  txHash: string;
  status: string;
}

// =============================================================================
// GET /api/swap/events/:swapId (SSE)
// =============================================================================

export interface SwapEventData {
  swapId: string;
  status: string;
  progress: number;
  direction: string;
  txHash: string | undefined;
}
