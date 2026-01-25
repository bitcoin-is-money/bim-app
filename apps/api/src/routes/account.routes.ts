import {
  Account,
  AccountId,
  AccountNotFoundError,
  type DeployAccountOutput,
  getDeployAccountUseCase,
  InvalidAccountStateError,
} from '@bim/domain';
import {Hono} from 'hono';
import type {AppContext} from "../app-context";
import {createAuthMiddleware} from '../middleware/auth.middleware';
import type {AuthenticatedHono} from '../types.js';

// =============================================================================
// Routes
// =============================================================================

export function createAccountRoutes(appContext: AppContext): AuthenticatedHono {
  const app: AuthenticatedHono = new Hono();

  app.use('*', createAuthMiddleware(appContext));

  // ---------------------------------------------------------------------------
  // Get Current Account
  // ---------------------------------------------------------------------------

  app.get('/me', (ctx) => {
    const account: Account = ctx.get('account');

    return ctx.json({
      id: account.id,
      username: account.username,
      starknetAddress: account.getStarknetAddress(),
      status: account.getStatus(),
      deploymentTxHash: account.getDeploymentTxHash(),
      createdAt: account.createdAt.toISOString(),
    });
  });

  // ---------------------------------------------------------------------------
  // Deploy Account
  // ---------------------------------------------------------------------------

  app.post('/deploy', async (ctx) => {
    try {
      const account: Account = ctx.get('account');

      const deployAccount = getDeployAccountUseCase({
        accountRepository: appContext.repositories.account,
        starknetGateway: appContext.gateways.starknet,
        paymasterGateway: appContext.gateways.paymaster,
      });

      const result: DeployAccountOutput = await deployAccount({
        accountId: AccountId.of(account.id),
      });

      return ctx.json({
        txHash: result.txHash,
        status: result.account.getStatus(),
      });
    } catch (error) {
      return handleError(ctx, error);
    }
  });

  // ---------------------------------------------------------------------------
  // Get Deployment Status
  // ---------------------------------------------------------------------------

  app.get('/deployment-status', async (ctx) => {
    const account: Account = ctx.get('account');

    // Reload account to get the latest status
    const freshAccount: Account | undefined = await appContext.repositories.account.findById(
      AccountId.of(account.id),
    );

    if (!freshAccount) {
      return ctx.json({ error: 'Account not found' }, 404);
    }

    return ctx.json({
      status: freshAccount.getStatus(),
      txHash: freshAccount.getDeploymentTxHash(),
      isDeployed: freshAccount.isDeployed(),
    });
  });

  return app;
}

// =============================================================================
// Helpers
// =============================================================================

function handleError(
  ctx: { json: (data: unknown, status: number) => Response },
  error: unknown
): Response {
  console.error('Account error:', error);

  if (error instanceof AccountNotFoundError) {
    return ctx.json({ error: 'Account not found' }, 404);
  }

  if (error instanceof InvalidAccountStateError) {
    return ctx.json({ error: error.message }, 400);
  }

  return ctx.json({ error: 'Internal server error' }, 500);
}
