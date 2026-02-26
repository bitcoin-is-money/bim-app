
// =============================================================================
// GET /api/user/transactions
// =============================================================================

export interface TransactionResponse {
  id: string;
  transactionHash: string;
  blockNumber: string;
  type: string;
  amount: string;
  tokenAddress: string;
  fromAddress: string;
  toAddress: string;
  timestamp: string;
  indexedAt: string;
  description: string;
}

export interface GetTransactionsResponse {
  transactions: TransactionResponse[];
  total: number;
  limit: number;
  offset: number;
}

// =============================================================================
// PUT /api/user/transactions/:transactionHash/description
// =============================================================================

export interface SetDescriptionResponse {
  transactionHash: string;
  description: string;
}

// =============================================================================
// DELETE /api/user/transactions/:transactionHash/description
// =============================================================================

export interface DeleteDescriptionResponse {
  transactionHash: string;
}
