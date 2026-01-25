import {
  getClaimSwapUseCase,
  getCreateBitcoinSwapUseCase,
  getCreateLightningSwapUseCase,
  getCreateStarknetToBitcoinUseCase,
  getCreateStarknetToLightningUseCase,
  getFetchSwapLimitsUseCase,
  getFetchSwapStatusUseCase,
  getValidateSessionUseCase,
  InvalidSwapStateError,
  SessionExpiredError,
  SessionNotFoundError,
  SwapAmountError,
  SwapClaimError,
  SwapCreationError,
  SwapNotFoundError,
} from '@bim/domain';
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

  // ---------------------------------------------------------------------------
  // Get Swap Limits
  // ---------------------------------------------------------------------------

  app.get('/limits/:direction', async (ctx) => {
    try {
      const direction = SwapDirectionSchema.parse(ctx.req.param('direction'));

      const fetchSwapLimits = getFetchSwapLimitsUseCase({
        atomiqGateway: appContext.gateways.atomiq,
      });

      const result = await fetchSwapLimits({ direction });

      return ctx.json({
        minSats: result.limits.minSats.toString(),
        maxSats: result.limits.maxSats.toString(),
        feePercent: result.limits.feePercent,
      });
    } catch (error) {
      return handleError(ctx, error);
    }
  });

  // ---------------------------------------------------------------------------
  // Create Lightning → Starknet Swap
  // ---------------------------------------------------------------------------

  app.post('/lightning-to-starknet', async (ctx) => {
    try {
      const body = await ctx.req.json();
      const input = CreateLightningSwapSchema.parse(body);

      const createSwap = getCreateLightningSwapUseCase({
        swapRepository: appContext.repositories.swap,
        atomiqGateway: appContext.gateways.atomiq,
      });

      const result = await createSwap({
        amountSats: input.amountSats,
        destinationAddress: input.destinationAddress,
      });

      return ctx.json({
        swapId: result.swap.id,
        invoice: result.invoice,
        amountSats: result.swap.amountSats.toString(),
        expiresAt: result.swap.expiresAt.toISOString(),
      });
    } catch (error) {
      return handleError(ctx, error);
    }
  });

  // ---------------------------------------------------------------------------
  // Create Bitcoin → Starknet Swap
  // ---------------------------------------------------------------------------

  app.post('/bitcoin-to-starknet', async (ctx) => {
    try {
      const body = await ctx.req.json();
      const input = CreateBitcoinSwapSchema.parse(body);

      const createSwap = getCreateBitcoinSwapUseCase({
        swapRepository: appContext.repositories.swap,
        atomiqGateway: appContext.gateways.atomiq,
      });

      const result = await createSwap({
        amountSats: input.amountSats,
        destinationAddress: input.destinationAddress,
      });

      return ctx.json({
        swapId: result.swap.id,
        depositAddress: result.depositAddress,
        bip21Uri: result.bip21Uri,
        amountSats: result.swap.amountSats.toString(),
        expiresAt: result.swap.expiresAt.toISOString(),
      });
    } catch (error) {
      return handleError(ctx, error);
    }
  });

  // ---------------------------------------------------------------------------
  // Create Starknet → Lightning Swap
  // ---------------------------------------------------------------------------

  app.post('/starknet-to-lightning', async (ctx) => {
    try {
      const body = await ctx.req.json();
      const input = CreateStarknetToLightningSchema.parse(body);

      const createSwap = getCreateStarknetToLightningUseCase({
        swapRepository: appContext.repositories.swap,
        atomiqGateway: appContext.gateways.atomiq,
      });

      const result = await createSwap({
        invoice: input.invoice,
        sourceAddress: input.sourceAddress,
      });

      return ctx.json({
        swapId: result.swap.id,
        depositAddress: result.depositAddress,
        amountSats: result.amountSats.toString(),
        expiresAt: result.swap.expiresAt.toISOString(),
      });
    } catch (error) {
      return handleError(ctx, error);
    }
  });

  // ---------------------------------------------------------------------------
  // Create Starknet → Bitcoin Swap
  // ---------------------------------------------------------------------------

  app.post('/starknet-to-bitcoin', async (ctx) => {
    try {
      const body = await ctx.req.json();
      const input = CreateStarknetToBitcoinSchema.parse(body);

      const createSwap = getCreateStarknetToBitcoinUseCase({
        swapRepository: appContext.repositories.swap,
        atomiqGateway: appContext.gateways.atomiq,
      });

      const result = await createSwap({
        amountSats: input.amountSats,
        destinationAddress: input.destinationAddress,
        sourceAddress: input.sourceAddress,
      });

      return ctx.json({
        swapId: result.swap.id,
        depositAddress: result.depositAddress,
        amountSats: result.swap.amountSats.toString(),
        expiresAt: result.swap.expiresAt.toISOString(),
      });
    } catch (error) {
      return handleError(ctx, error);
    }
  });

  // ---------------------------------------------------------------------------
  // Get Swap Status
  // ---------------------------------------------------------------------------

  app.get('/status/:swapId', async (ctx) => {
    try {
      const swapId = ctx.req.param('swapId');

      const fetchSwapStatus = getFetchSwapStatusUseCase({
        swapRepository: appContext.repositories.swap,
        atomiqGateway: appContext.gateways.atomiq,
      });

      const result = await fetchSwapStatus({ swapId });

      return ctx.json({
        swapId: result.swap.id,
        direction: result.swap.direction,
        status: result.status,
        progress: result.progress,
        txHash: result.txHash,
        amountSats: result.swap.amountSats.toString(),
        destinationAddress: result.swap.destinationAddress,
        expiresAt: result.swap.expiresAt.toISOString(),
      });
    } catch (error) {
      return handleError(ctx, error);
    }
  });

  // ---------------------------------------------------------------------------
  // Claim Swap
  // ---------------------------------------------------------------------------

  app.post('/claim/:swapId', async (ctx) => {
    try {
      const swapId = ctx.req.param('swapId');

      const claimSwap = getClaimSwapUseCase({
        swapRepository: appContext.repositories.swap,
        atomiqGateway: appContext.gateways.atomiq,
      });

      const result = await claimSwap({ swapId });

      return ctx.json({
        swapId: result.swap.id,
        txHash: result.txHash,
        status: result.swap.getStatus(),
      });
    } catch (error) {
      return handleError(ctx, error);
    }
  });

  return app;
}

// =============================================================================
// Helpers
// =============================================================================

function getSessionId(ctx: { req: { header: (name: string) => string | undefined } }): string | undefined {
  const cookie = ctx.req.header('Cookie');
  if (!cookie) return undefined;

  const match = /session=([^;]+)/.exec(cookie);
  return match?.[1];
}

function handleError(ctx: { json: (data: unknown, status: number) => Response }, error: unknown): Response {
  console.error('Swap error:', error);

  if (error instanceof z.ZodError) {
    return ctx.json(
      { error: 'Validation error', details: error.errors },
      400,
    );
  }

  if (error instanceof SwapNotFoundError) {
    return ctx.json({ error: 'Swap not found' }, 404);
  }

  if (error instanceof SwapAmountError) {
    return ctx.json(
      {
        error: 'Amount out of range',
        min: error.min.toString(),
        max: error.max.toString(),
      },
      400,
    );
  }

  if (error instanceof SwapCreationError) {
    return ctx.json({ error: error.message }, 400);
  }

  if (error instanceof SwapClaimError) {
    return ctx.json({ error: error.message }, 400);
  }

  if (error instanceof InvalidSwapStateError) {
    return ctx.json({ error: error.message }, 400);
  }

  return ctx.json({ error: 'Internal server error' }, 500);
}
