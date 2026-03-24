import {z} from 'zod';

export const GetTransactionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10),
  offset: z.coerce.number().int().min(0).default(0),
});

export const SetDescriptionSchema = z.object({
  description: z.string().min(1).max(100),
});

/** Validated query params for GET /api/user/transactions */
export type GetTransactionsQuery = z.infer<typeof GetTransactionsQuerySchema>;
/** Validated body for PUT /api/user/transactions/:hash/description */
export type SetDescriptionBody = z.infer<typeof SetDescriptionSchema>;

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

/** API response from PUT /api/user/transactions/:hash/description */
export interface SetDescriptionResponse {
  transactionHash: string;
  description: string;
}

/** API response from DELETE /api/user/transactions/:hash/description */
export interface DeleteDescriptionResponse {
  transactionHash: string;
}
