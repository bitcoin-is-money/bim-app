import {
  Account,
  getFetchTransactionsUseCase,
} from '@bim/domain';
import {Hono} from 'hono';
import type {AppContext} from "../app-context";
import {createAuthMiddleware} from '../middleware/auth.middleware';
import type {AuthenticatedHono} from '../types.js';

// =============================================================================
// Routes
// =============================================================================

export function createTransactionRoutes(appContext: AppContext): AuthenticatedHono {
  const app: AuthenticatedHono = new Hono();

  app.use('*', createAuthMiddleware(appContext));

  // ---------------------------------------------------------------------------
  // Get Transactions
  // ---------------------------------------------------------------------------

  app.get('/', async (ctx) => {
    try {
      const account: Account = ctx.get('account');

      // Parse pagination parameters
      const limitParam = ctx.req.query('limit');
      const offsetParam = ctx.req.query('offset');
      const limit = limitParam ? Number.parseInt(limitParam, 10) : 50;
      const offset = offsetParam ? Number.parseInt(offsetParam, 10) : 0;

      const fetchTransactions = getFetchTransactionsUseCase({
        transactionRepository: appContext.repositories.transaction,
        watchedAddressRepository: appContext.repositories.watchedAddress,
      });

      const result = await fetchTransactions({
        accountId: account.id,
        limit,
        offset,
      });

      return ctx.json({
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
        })),
        total: result.total,
        limit,
        offset,
      });
    } catch (error) {
      console.error('Transaction error:', error);
      return ctx.json({error: 'Internal server error'}, 500);
    }
  });

  return app;
}

