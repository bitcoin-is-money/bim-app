import type {TypedResponse} from 'hono';
import {Hono} from 'hono';

import type {Account} from '@bim/domain/account';

import type {AppContext} from '../../app-context';
import {type ApiErrorResponse, handleDomainError} from '../../errors';
import {createAuthMiddleware} from '../../middleware/auth.middleware';
import type {AuthenticatedHono} from '../../types.js';
import {SwapDirectionSchema, SwapIdParamSchema} from './swap.types';
import type {
  ActiveSwapsResponse,
  SwapDirection,
  SwapIdParam,
  SwapLimitsResponse,
  SwapStatusResponse,
} from './swap.types';

// =============================================================================
// Routes
// =============================================================================

export function createSwapRoutes(appContext: AppContext): AuthenticatedHono {
  const log = appContext.logger.child({name: 'swap.routes.ts'});
  const app: AuthenticatedHono = new Hono();

  app.use('*', createAuthMiddleware(appContext));

  // Service from AppContext (initialized once at startup)
  const {swap: swapService} = appContext.services;

  // ---------------------------------------------------------------------------
  // Get Swap Limits
  // ---------------------------------------------------------------------------

  app.get('/limits/:direction', async (honoCtx): Promise<TypedResponse<SwapLimitsResponse | ApiErrorResponse>> => {
    try {
      const direction: SwapDirection = SwapDirectionSchema.parse(honoCtx.req.param('direction'));

      const result = await swapService.fetchLimits({direction});

      return honoCtx.json<SwapLimitsResponse>({
        minSats: result.limits.minSats.toString(),
        maxSats: result.limits.maxSats.toString(),
        feePercent: result.limits.feePercent,
      });
    } catch (error) {
      return handleDomainError(honoCtx, error, log);
    }
  });

  // ---------------------------------------------------------------------------
  // Get Swap Status
  // ---------------------------------------------------------------------------

  app.get('/status/:swapId', async (honoCtx): Promise<TypedResponse<SwapStatusResponse | ApiErrorResponse>> => {
    try {
      const account: Account = honoCtx.get('account');
      const swapId: SwapIdParam = SwapIdParamSchema.parse(honoCtx.req.param('swapId'));

      const result = await swapService.fetchStatus({swapId, accountId: account.id});

      // Map internal 'claimable' to 'paid' for the frontend — the distinction
      // is only relevant for backend orchestration (SwapMonitor claim timing).
      const publicStatus = result.status === 'claimable' ? 'paid' : result.status;

      return honoCtx.json<SwapStatusResponse>({
        swapId: result.swap.data.id,
        direction: result.swap.data.direction,
        status: publicStatus,
        progress: result.progress,
        txHash: result.txHash,
        amountSats: result.swap.data.amount.toSatString(),
        destinationAddress: result.swap.data.destinationAddress,
        expiresAt: result.swap.data.expiresAt.toISOString(),
      });
    } catch (error) {
      return handleDomainError(honoCtx, error, log);
    }
  });

  // ---------------------------------------------------------------------------
  // Active Swaps (count for the authenticated account)
  // ---------------------------------------------------------------------------
  // Used by the PWA update flow on the frontend: after a successful login,
  // the client calls this endpoint to know whether it is safe to apply a
  // pending client update. We never reload the app while swaps are in flight.

  app.get('/active', async (honoCtx): Promise<TypedResponse<ActiveSwapsResponse | ApiErrorResponse>> => {
    try {
      const account: Account = honoCtx.get('account');

      const count = await swapService.countActiveForAccount(account.id);

      return honoCtx.json<ActiveSwapsResponse>({
        active: count > 0,
        count,
      });
    } catch (error) {
      return handleDomainError(honoCtx, error, log);
    }
  });

  return app;
}
