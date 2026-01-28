import {
  Account,
  AccountId,
  AccountNotFoundError,
  type DeployAccountOutput,
  getDeployAccountService,
  InvalidAccountStateError,
} from '@bim/domain';
import {Hono} from 'hono';
import type {AppContext} from "../../app-context";
import {createAuthMiddleware} from '../../middleware/auth.middleware';
import type {AuthenticatedHono} from '../../types.js';

// =============================================================================
// Routes
// =============================================================================

export function createAccountRoutes(appCtx: AppContext): AuthenticatedHono {
  const app: AuthenticatedHono = new Hono();

  app.use('*', createAuthMiddleware(appCtx));

  // ---------------------------------------------------------------------------
  // Get Current Account
  // ---------------------------------------------------------------------------

  app.get('/me', (honoCtx) => {
    const account: Account = honoCtx.get('account');

    return honoCtx.json({
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

  app.post('/deploy', async (honoCtx) => {
    try {
      const account: Account = honoCtx.get('account');

      const deployAccount = getDeployAccountService({
        accountRepository: appCtx.repositories.account,
        starknetGateway: appCtx.gateways.starknet,
        paymasterGateway: appCtx.gateways.paymaster,
      });

      const result: DeployAccountOutput = await deployAccount({
        accountId: AccountId.of(account.id),
      });

      return honoCtx.json({
        txHash: result.txHash,
        status: result.account.getStatus(),
      });
    } catch (error) {
      return handleError(honoCtx, error);
    }
  });

  // ---------------------------------------------------------------------------
  // Get Deployment Status
  // ---------------------------------------------------------------------------

  app.get('/deployment-status', async (honoCtx) => {
    const account: Account = honoCtx.get('account');

    // Reload account to get the latest status
    const freshAccount: Account | undefined = await appCtx.repositories.account.findById(
      AccountId.of(account.id),
    );

    if (!freshAccount) {
      return honoCtx.json({ error: 'Account not found' }, 404);
    }

    return honoCtx.json({
      status: freshAccount.getStatus(),
      txHash: freshAccount.getDeploymentTxHash(),
      isDeployed: freshAccount.isDeployed(),
    });
  });


  app.get('/balance', async (honoCtx) => {
    try {
      // TODO: Implement real balance retrieval from the account
      // For now, return mocked data (amount in SAT)
      return honoCtx.json({
        amount: 125050000,
        currency: 'SAT',
      });
    } catch (error) {
      console.error('Balance error:', error);
      return honoCtx.json({error: 'Internal server error'}, 500);
    }
  });

  return app;
}

// =============================================================================
// Helpers
// =============================================================================

function handleError(
  honoCtx: { json: (data: unknown, status: number) => Response },
  error: unknown
): Response {
  console.error('Account error:', error);

  if (error instanceof AccountNotFoundError) {
    return honoCtx.json({ error: 'Account not found' }, 404);
  }

  if (error instanceof InvalidAccountStateError) {
    return honoCtx.json({ error: error.message }, 400);
  }

  return honoCtx.json({ error: 'Internal server error' }, 500);
}
