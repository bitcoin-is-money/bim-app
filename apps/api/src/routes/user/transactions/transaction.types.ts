import {z} from 'zod';

export const GetTransactionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10),
  offset: z.coerce.number().int().min(0).default(0),
});

/** Validated query params for GET /api/user/transactions */
export type GetTransactionsQuery = z.infer<typeof GetTransactionsQuerySchema>;

/** Single transaction in the API response. */
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

/** API response from GET /api/user/transactions */
export interface GetTransactionsResponse {
  transactions: TransactionResponse[];
  total: number;
  limit: number;
  offset: number;
}
