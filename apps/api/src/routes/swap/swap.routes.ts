import type {TypedResponse} from 'hono';
import {Hono} from 'hono';
import {basename} from 'node:path';
import type {AppContext} from '../../app-context';
import {type ApiErrorResponse, handleDomainError} from '../../errors';
import {createAuthMiddleware} from '../../middleware/auth.middleware';
import type {AuthenticatedHono} from '../../types.js';
import {SwapDirectionSchema} from './swap.schemas';
import type {SwapClaimResponse, SwapLimitsResponse, SwapStatusResponse} from './swap.types';

// =============================================================================
// Routes
// =============================================================================

export function createSwapRoutes(appContext: AppContext): AuthenticatedHono {
  const log = appContext.logger.child({name: basename(import.meta.filename)});
  const app: AuthenticatedHono = new Hono();

  app.use('*', createAuthMiddleware(appContext));

  // Service from AppContext (initialized once at startup)
  const {swap: swapService} = appContext.services;

  // ---------------------------------------------------------------------------
  // Get Swap Limits
  // ---------------------------------------------------------------------------

  app.get('/limits/:direction', async (honoCtx): Promise<TypedResponse<SwapLimitsResponse | ApiErrorResponse>> => {
    try {
      const direction = SwapDirectionSchema.parse(honoCtx.req.param('direction'));

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
      const swapId = honoCtx.req.param('swapId');

      const result = await swapService.fetchStatus({swapId});

      return honoCtx.json<SwapStatusResponse>({
        swapId: result.swap.id,
        direction: result.swap.direction,
        status: result.status,
        progress: result.progress,
        txHash: result.txHash,
        amountSats: result.swap.amount.toSatString(),
        destinationAddress: result.swap.destinationAddress,
        expiresAt: result.swap.expiresAt.toISOString(),
      });
    } catch (error) {
      return handleDomainError(honoCtx, error, log);
    }
  });

  // ---------------------------------------------------------------------------
  // Claim Swap (used by SwapMonitor and tests — not called by frontend)
  // ---------------------------------------------------------------------------

  app.post('/claim/:swapId', async (honoCtx): Promise<TypedResponse<SwapClaimResponse | ApiErrorResponse>> => {
    try {
      const swapId = honoCtx.req.param('swapId');

      const result = await swapService.claim({swapId});

      return honoCtx.json<SwapClaimResponse>({
        swapId: result.swap.id,
        txHash: result.txHash,
        status: result.swap.getStatus(),
      });
    } catch (error) {
      return handleDomainError(honoCtx, error, log);
    }
  });

  return app;
}
