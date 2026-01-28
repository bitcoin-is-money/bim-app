import {Amount} from '@bim/domain/shared';
import {
  InvalidSwapStateError,
  SwapAmountError,
  SwapClaimError,
  SwapCreationError,
  SwapNotFoundError,
} from '@bim/domain/swap';
import {Hono} from 'hono';
import {z} from 'zod';
import type {AppContext} from "../app-context";
import {createAuthMiddleware} from "../middleware/auth.middleware";
import type {AuthenticatedHono} from '../types.js';

// =============================================================================
// Validation Schemas
// =============================================================================

const CreateLightningSwapSchema = z.object({
  amountSats: z.string().transform(BigInt),
  destinationAddress: z.string(),
});

const CreateBitcoinSwapSchema = z.object({
  amountSats: z.string().transform(BigInt),
  destinationAddress: z.string(),
});

const CreateStarknetToLightningSchema = z.object({
  invoice: z.string(),
  sourceAddress: z.string(),
});

const CreateStarknetToBitcoinSchema = z.object({
  amountSats: z.string().transform(BigInt),
  destinationAddress: z.string(),
  sourceAddress: z.string(),
});

const SwapDirectionSchema = z.enum([
  'lightning_to_starknet',
  'bitcoin_to_starknet',
  'starknet_to_lightning',
  'starknet_to_bitcoin',
]);

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

  app.get('/limits/:direction', async (honoCtx) => {
    try {
      const direction = SwapDirectionSchema.parse(honoCtx.req.param('direction'));

      const result = await swapService.fetchLimits({ direction });

      return honoCtx.json({
        minSats: result.limits.minSats.toString(),
        maxSats: result.limits.maxSats.toString(),
        feePercent: result.limits.feePercent,
      });
    } catch (error) {
      return handleError(honoCtx, error);
    }
  });

  // ---------------------------------------------------------------------------
  // Create Lightning → Starknet Swap
  // ---------------------------------------------------------------------------

  app.post('/lightning-to-starknet', async (honoCtx) => {
    try {
      const body = await honoCtx.req.json();
      const input = CreateLightningSwapSchema.parse(body);

      const result = await swapService.createLightningToStarknet({
        amount: Amount.ofSatoshi(input.amountSats),
        destinationAddress: input.destinationAddress,
      });

      return honoCtx.json({
        swapId: result.swap.id,
        invoice: result.invoice,
        amountSats: result.swap.amount.toSatString(),
        expiresAt: result.swap.expiresAt.toISOString(),
      });
    } catch (error) {
      return handleError(honoCtx, error);
    }
  });

  // ---------------------------------------------------------------------------
  // Create Bitcoin → Starknet Swap
  // ---------------------------------------------------------------------------

  app.post('/bitcoin-to-starknet', async (honoCtx) => {
    try {
      const body = await honoCtx.req.json();
      const input = CreateBitcoinSwapSchema.parse(body);

      const result = await swapService.createBitcoinToStarknet({
        amount: Amount.ofSatoshi(input.amountSats),
        destinationAddress: input.destinationAddress,
      });

      return honoCtx.json({
        swapId: result.swap.id,
        depositAddress: result.depositAddress,
        bip21Uri: result.bip21Uri,
        amountSats: result.swap.amount.toSatString(),
        expiresAt: result.swap.expiresAt.toISOString(),
      });
    } catch (error) {
      return handleError(honoCtx, error);
    }
  });

  // ---------------------------------------------------------------------------
  // Create Starknet → Lightning Swap
  // ---------------------------------------------------------------------------

  app.post('/starknet-to-lightning', async (honoCtx) => {
    try {
      const body = await honoCtx.req.json();
      const input = CreateStarknetToLightningSchema.parse(body);

      const result = await swapService.createStarknetToLightning({
        invoice: input.invoice,
        sourceAddress: input.sourceAddress,
      });

      return honoCtx.json({
        swapId: result.swap.id,
        depositAddress: result.depositAddress,
        amountSats: result.amount.toSatString(),
        expiresAt: result.swap.expiresAt.toISOString(),
      });
    } catch (error) {
      return handleError(honoCtx, error);
    }
  });

  // ---------------------------------------------------------------------------
  // Create Starknet → Bitcoin Swap
  // ---------------------------------------------------------------------------

  app.post('/starknet-to-bitcoin', async (honoCtx) => {
    try {
      const body = await honoCtx.req.json();
      const input = CreateStarknetToBitcoinSchema.parse(body);

      const result = await swapService.createStarknetToBitcoin({
        amount: Amount.ofSatoshi(input.amountSats),
        destinationAddress: input.destinationAddress,
        sourceAddress: input.sourceAddress,
      });

      return honoCtx.json({
        swapId: result.swap.id,
        depositAddress: result.depositAddress,
        amountSats: result.swap.amount.toSatString(),
        expiresAt: result.swap.expiresAt.toISOString(),
      });
    } catch (error) {
      return handleError(honoCtx, error);
    }
  });

  // ---------------------------------------------------------------------------
  // Get Swap Status
  // ---------------------------------------------------------------------------

  app.get('/status/:swapId', async (honoCtx) => {
    try {
      const swapId = honoCtx.req.param('swapId');

      const result = await swapService.fetchStatus({ swapId });

      return honoCtx.json({
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
  // Claim Swap
  // ---------------------------------------------------------------------------

  app.post('/claim/:swapId', async (honoCtx) => {
    try {
      const swapId = honoCtx.req.param('swapId');

      const result = await swapService.claim({ swapId });

      return honoCtx.json({
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
