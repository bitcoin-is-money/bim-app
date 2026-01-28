import {Account} from '@bim/domain/account';
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

  // Service from AppContext (initialized once at startup)
  const {transaction: transactionService} = appContext.services;

  // ---------------------------------------------------------------------------
  // Get Transactions
  // ---------------------------------------------------------------------------

  app.get('/', async (honoCtx) => {
    try {
      const account: Account = honoCtx.get('account');

      // Parse pagination parameters
      const limitParam = honoCtx.req.query('limit');
      const offsetParam = honoCtx.req.query('offset');
      const limit = limitParam ? Number.parseInt(limitParam, 10) : 10;
      const offset = offsetParam ? Number.parseInt(offsetParam, 10) : 0;

      const result = await transactionService.fetchForAccount({
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
        })),
        total: result.total,
        limit,
        offset,
      });
    } catch (error) {
      console.error('Transaction error:', error);
      return honoCtx.json({error: 'Internal server error'}, 500);
    }
  });

  return app;
}

