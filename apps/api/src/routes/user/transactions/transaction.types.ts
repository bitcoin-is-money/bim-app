
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
}

export interface GetTransactionsResponse {
  transactions: TransactionResponse[];
  total: number;
  limit: number;
  offset: number;
}
