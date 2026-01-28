import {
  Account,
  AccountId,
  AccountNotFoundError,
  type DeployAccountOutput,
  getDeployAccountService,
  getGetBalanceService,
  InvalidAccountStateError,
} from '@bim/domain';
import {Hono} from 'hono';
import type {TypedResponse} from 'hono';
import type {AppContext} from "../../app-context";
import {createAuthMiddleware} from '../../middleware/auth.middleware';
import type {AuthenticatedHono} from '../../types.js';
import type {
  DeployAccountRequest,
  DeployAccountResponse,
  GetAccountResponse,
  GetBalanceResponse,
  GetDeploymentStatusResponse,
} from './account.types';

// =============================================================================
// Routes
// =============================================================================

export function createAccountRoutes(appCtx: AppContext): AuthenticatedHono {
  const app: AuthenticatedHono = new Hono();

  app.use('*', createAuthMiddleware(appCtx));

  // ---------------------------------------------------------------------------
  // Get Current Account
  // ---------------------------------------------------------------------------

  app.get('/me', (honoCtx): TypedResponse<GetAccountResponse> => {
    const account: Account = honoCtx.get('account');

    return honoCtx.json<GetAccountResponse>({
      id: account.id,
      username: account.username,
      starknetAddress: account.getStarknetAddress() ?? null,
      status: account.getStatus(),
      deploymentTxHash: account.getDeploymentTxHash() ?? null,
      createdAt: account.createdAt.toISOString(),
    });
  });

  // ---------------------------------------------------------------------------
  // Deploy Account
  // ---------------------------------------------------------------------------

  app.post('/deploy', async (honoCtx): Promise<TypedResponse<DeployAccountResponse> | Response> => {
    try {
      const account: Account = honoCtx.get('account');
      const body: DeployAccountRequest = await honoCtx.req.json().catch(() => ({}));
      const sync = body.sync === true;

      const deployAccount = getDeployAccountService({
        accountRepository: appCtx.repositories.account,
        starknetGateway: appCtx.gateways.starknet,
        paymasterGateway: appCtx.gateways.paymaster,
      });

      const result: DeployAccountOutput = await deployAccount({
        accountId: AccountId.of(account.id),
        sync,
      });

      return honoCtx.json<DeployAccountResponse>({
        txHash: result.txHash,
        status: result.account.getStatus(),
        starknetAddress: result.account.getStarknetAddress()!,
      });
    } catch (error) {
      return handleError(honoCtx, error);
    }
  });

  // ---------------------------------------------------------------------------
  // Get Deployment Status
  // ---------------------------------------------------------------------------

  app.get('/deployment-status', async (honoCtx): Promise<TypedResponse<GetDeploymentStatusResponse> | Response> => {
    const account: Account = honoCtx.get('account');

    // Reload account to get the latest status
    const freshAccount: Account | undefined = await appCtx.repositories.account.findById(
      AccountId.of(account.id),
    );

    if (!freshAccount) {
      return honoCtx.json({ error: 'Account not found' }, 404);
    }

    return honoCtx.json<GetDeploymentStatusResponse>({
      status: freshAccount.getStatus(),
      txHash: freshAccount.getDeploymentTxHash() ?? null,
      isDeployed: freshAccount.isDeployed(),
    });
  });

  app.get('/balance', async (honoCtx): Promise<TypedResponse<GetBalanceResponse> | Response> => {
    try {
      const account: Account = honoCtx.get('account');

      const getBalance = getGetBalanceService({
        accountRepository: appCtx.repositories.account,
        starknetGateway: appCtx.gateways.starknet,
      });

      const result = await getBalance({ accountId: account.id });

      return honoCtx.json<GetBalanceResponse>(result);
    } catch (error) {
      return handleError(honoCtx, error);
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
