import {
  InvalidSwapStateError,
  SwapAmountError,
  SwapClaimError,
  SwapCreationError,
  SwapNotFoundError,
} from '@bim/domain/swap';
import {Hono} from 'hono';
import type {TypedResponse} from 'hono';
import {z} from 'zod';
import type {AppContext} from "../../app-context";
import {createAuthMiddleware} from "../../middleware/auth.middleware";
import type {AuthenticatedHono} from '../../types.js';
import {SwapDirectionSchema} from './swap.schemas';
import type {SwapClaimResponse, SwapLimitsResponse, SwapStatusResponse} from './swap.types';

// =============================================================================
// Routes
// =============================================================================

export function createSwapRoutes(appContext: AppContext): AuthenticatedHono {
  const app: AuthenticatedHono = new Hono();

  app.use('*', createAuthMiddleware(appContext));

  // Service from AppContext (initialized once at startup)
  const {swap: swapService} = appContext.services;

  // ---------------------------------------------------------------------------
  // Get Swap Limits
  // ---------------------------------------------------------------------------

  app.get('/limits/:direction', async (honoCtx): Promise<TypedResponse<SwapLimitsResponse> | Response> => {
    try {
      const direction = SwapDirectionSchema.parse(honoCtx.req.param('direction'));

      const result = await swapService.fetchLimits({ direction });

      return honoCtx.json<SwapLimitsResponse>({
        minSats: result.limits.minSats.toString(),
        maxSats: result.limits.maxSats.toString(),
        feePercent: result.limits.feePercent,
      });
    } catch (error) {
      return handleError(honoCtx, error);
    }
  });

  // ---------------------------------------------------------------------------
  // Get Swap Status
  // ---------------------------------------------------------------------------

  app.get('/status/:swapId', async (honoCtx): Promise<TypedResponse<SwapStatusResponse> | Response> => {
    try {
      const swapId = honoCtx.req.param('swapId');

      const result = await swapService.fetchStatus({ swapId });

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
      return handleError(honoCtx, error);
    }
  });

  // ---------------------------------------------------------------------------
  // Claim Swap (used by SwapMonitor and tests — not called by frontend)
  // ---------------------------------------------------------------------------

  app.post('/claim/:swapId', async (honoCtx): Promise<TypedResponse<SwapClaimResponse> | Response> => {
    try {
      const swapId = honoCtx.req.param('swapId');

      const result = await swapService.claim({ swapId });

      return honoCtx.json<SwapClaimResponse>({
        swapId: result.swap.id,
        txHash: result.txHash,
        status: result.swap.getStatus(),
      });
    } catch (error) {
      return handleError(honoCtx, error);
    }
  });

  return app;
}

// =============================================================================
// Helpers
// =============================================================================

function handleError(honoCtx: { json: (data: unknown, status: number) => Response }, error: unknown): Response {
  console.error('Swap error:', error);

  if (error instanceof z.ZodError) {
    return honoCtx.json(
      { error: 'Validation error', details: error.errors },
      400,
    );
  }

  if (error instanceof SwapNotFoundError) {
    return honoCtx.json({ error: 'Swap not found' }, 404);
  }

  if (error instanceof SwapAmountError) {
    return honoCtx.json(
      {
        error: 'Amount out of range',
        min: error.min.toSatString(),
        max: error.max.toSatString(),
      },
      400,
    );
  }

  if (error instanceof SwapCreationError) {
    return honoCtx.json({ error: error.message }, 400);
  }

  if (error instanceof SwapClaimError) {
    return honoCtx.json({ error: error.message }, 400);
  }

  if (error instanceof InvalidSwapStateError) {
    return honoCtx.json({ error: error.message }, 400);
  }

  return honoCtx.json({ error: 'Internal server error' }, 500);
}
