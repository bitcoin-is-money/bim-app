import type {Account} from '@bim/domain/account';
import type {TypedResponse} from 'hono';
import {Hono} from 'hono';

import type {AppContext} from '../../../app-context';
import {type ApiErrorResponse, handleDomainError} from '../../../errors';
import type {AuthenticatedHono} from '../../../types.js';
import type {GetTransactionsQuery, GetTransactionsResponse} from './transaction.types';
import {GetTransactionsQuerySchema} from './transaction.types';

// =============================================================================
// Routes
// =============================================================================

export function createTransactionRoutes(appContext: AppContext): AuthenticatedHono {
  const log = appContext.logger.child({name: 'transaction.routes.ts'});
  const app: AuthenticatedHono = new Hono();

  const {transactionReader} = appContext.useCases;

  // ---------------------------------------------------------------------------
  // Get Transactions
  // ---------------------------------------------------------------------------

  app.get('/', async (honoCtx): Promise<TypedResponse<GetTransactionsResponse | ApiErrorResponse>> => {
    try {
      const account: Account = honoCtx.get('account');

      const {limit, offset}: GetTransactionsQuery = GetTransactionsQuerySchema.parse({
        limit: honoCtx.req.query('limit'),
        offset: honoCtx.req.query('offset'),
      });

      const result = await transactionReader.fetchForAccount({
        accountId: account.id,
        limit,
        offset,
      });

      return honoCtx.json({
        transactions: result.transactions.map((tx) => ({
            id: tx.id,
            transactionHash: tx.transactionHash,
            blockNumber: tx.blockNumber.toString(),
            type: tx.transactionType,
            amount: tx.amount,
            tokenAddress: tx.tokenAddress,
            fromAddress: tx.fromAddress,
            toAddress: tx.toAddress,
            timestamp: tx.timestamp.toISOString(),
            indexedAt: tx.indexedAt.toISOString(),
            description: tx.description,
          })),
        total: result.total,
        limit,
        offset,
      } satisfies GetTransactionsResponse) as TypedResponse<GetTransactionsResponse>;
    } catch (error) {
      return handleDomainError(honoCtx, error, log);
    }
  });

  return app;
}
