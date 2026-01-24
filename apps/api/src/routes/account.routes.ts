import {
  Account,
  AccountId,
  AccountNotFoundError,
  type DeployAccountOutput,
  getDeployAccountUseCase,
  InvalidAccountStateError,
  InvalidSessionIdError,
  SessionExpiredError,
  SessionNotFoundError,
  getValidateSessionUseCase,
  type ValidateSessionOutput,
} from '@bim/domain';
import {Hono} from 'hono';
import type {AppContext} from "../app-context";
import type {AuthenticatedHono} from '../types.js';


// =============================================================================
// Routes
// =============================================================================

export function createAccountRoutes(appContext: AppContext): AuthenticatedHono {
  const app: AuthenticatedHono = new Hono();

  // Middleware: Require authentication
  app.use('*', async (ctx, next) => {
    const sessionId = getSessionId(ctx);
    if (!sessionId) {
      return ctx.json({ error: 'Unauthorized' }, 401);
    }

    try {
      const validate = getValidateSessionUseCase({
        sessionRepository: appContext.repositories.session,
        accountRepository: appContext.repositories.account,
      });

      const result: ValidateSessionOutput = await validate({ sessionId });
      ctx.set('account', result.account);
      ctx.set('session', result.session);
      await next();
    } catch (error) {
      if (
        error instanceof SessionExpiredError ||
        error instanceof SessionNotFoundError ||
        error instanceof InvalidSessionIdError
      ) {
        return ctx.json({ error: 'Session expired' }, 401);
      }
      throw error;
    }
  });

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

function getSessionId(ctx: { req: { header: (name: string) => string | undefined } }): string | undefined {
  const cookie = ctx.req.header('Cookie');
  if (!cookie) return undefined;

  const match = /session=([^;]+)/.exec(cookie);
  return match?.[1];
}

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
