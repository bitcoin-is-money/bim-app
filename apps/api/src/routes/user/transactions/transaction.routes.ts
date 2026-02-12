import {Account} from '@bim/domain/account';
import {Hono} from 'hono';
import type {TypedResponse} from 'hono';
import {basename} from 'node:path';
import {z} from 'zod';
import type {AppContext} from '../../../app-context';
import {handleDomainError, type ApiErrorResponse} from '../../../errors';
import type {AuthenticatedHono} from '../../../types.js';
import type {DeleteDescriptionResponse, GetTransactionsResponse, SetDescriptionResponse} from './transaction.types';

const SetDescriptionSchema = z.object({
  description: z.string().min(1).max(100),
});

// =============================================================================
// Routes
// =============================================================================

export function createTransactionRoutes(appContext: AppContext): AuthenticatedHono {
  const log = appContext.logger.child({name: basename(import.meta.filename)});
  const app: AuthenticatedHono = new Hono();

  // Service from AppContext (initialized once at startup)
  const {transaction: transactionService} = appContext.services;

  // ---------------------------------------------------------------------------
  // Get Transactions
  // ---------------------------------------------------------------------------

  app.get('/', async (honoCtx): Promise<TypedResponse<GetTransactionsResponse | ApiErrorResponse>> => {
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

      return honoCtx.json<GetTransactionsResponse>({
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
          description: tx.description ?? undefined,
        })),
        total: result.total,
        limit,
        offset,
      });
    } catch (error) {
      return handleDomainError(honoCtx, error, log);
    }
  });

  // ---------------------------------------------------------------------------
  // Set Transaction Description
  // ---------------------------------------------------------------------------

  app.put('/:transactionHash/description', async (honoCtx): Promise<TypedResponse<SetDescriptionResponse | ApiErrorResponse>> => {
    try {
      const account: Account = honoCtx.get('account');
      const transactionHash = honoCtx.req.param('transactionHash');

      const body = await honoCtx.req.json();
      const {description} = SetDescriptionSchema.parse(body);

      await transactionService.setDescription({
        accountId: account.id,
        transactionHash,
        description,
      });

      return honoCtx.json<SetDescriptionResponse>({transactionHash, description});
    } catch (error) {
      return handleDomainError(honoCtx, error, log);
    }
  });

  // ---------------------------------------------------------------------------
  // Delete Transaction Description
  // ---------------------------------------------------------------------------

  app.delete('/:transactionHash/description', async (honoCtx): Promise<TypedResponse<DeleteDescriptionResponse | ApiErrorResponse>> => {
    try {
      const account: Account = honoCtx.get('account');
      const transactionHash = honoCtx.req.param('transactionHash');

      await transactionService.deleteDescription({
        accountId: account.id,
        transactionHash,
      });

      return honoCtx.json<DeleteDescriptionResponse>({transactionHash});
    } catch (error) {
      return handleDomainError(honoCtx, error, log);
    }
  });

  return app;
}
