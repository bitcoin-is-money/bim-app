import {
  InvalidSwapStateError,
  SwapAmountError,
  SwapClaimError,
  SwapCreationError,
  SwapNotFoundError,
} from '@bim/domain/swap';
import {Hono} from 'hono';
import type {TypedResponse} from 'hono';
import {streamSSE} from 'hono/streaming';
import {z} from 'zod';
import type {AppContext} from "../../app-context";
import {createAuthMiddleware} from "../../middleware/auth.middleware";
import type {AuthenticatedHono} from '../../types.js';
import {SwapDirectionSchema} from './swap.schemas';
import type {SwapClaimResponse, SwapEventData, SwapLimitsResponse, SwapStatusResponse} from './swap.types';

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

  // ---------------------------------------------------------------------------
  // SSE: Stream Swap Status Events
  // ---------------------------------------------------------------------------

  app.get('/events/:swapId', (honoCtx): Response => {
    const swapId = honoCtx.req.param('swapId');
    const SSE_POLL_INTERVAL = 3000;

    return streamSSE(honoCtx, async (stream) => {
      let lastStatus: string | undefined;

      while (true) {
        try {
          const result = await swapService.fetchStatus({swapId});

          const currentStatus = result.status;
          if (currentStatus !== lastStatus) {
            lastStatus = currentStatus;
            const data: SwapEventData = {
              swapId: result.swap.id,
              status: result.status,
              progress: result.progress,
              direction: result.swap.direction,
              txHash: result.txHash,
            };
            await stream.writeSSE({
              event: 'status',
              data: JSON.stringify(data),
            });
          }

          // Close stream on terminal state
          if (['completed', 'expired', 'failed'].includes(currentStatus)) {
            return;
          }
        } catch {
          // Swap not found or sync error — close stream
          await stream.writeSSE({
            event: 'error',
            data: JSON.stringify({error: 'Swap not found or unavailable'}),
          });
          return;
        }

        await stream.sleep(SSE_POLL_INTERVAL);
      }
    });
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
