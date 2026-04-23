import type {Account} from '@bim/domain/account';
import type {TypedResponse} from 'hono';
import {Hono} from 'hono';

import type {AppContext} from '../../app-context';
import {type ApiErrorResponse, handleDomainError} from '../../errors';
import {createAuthMiddleware} from '../../middleware/auth.middleware';
import type {AuthenticatedHono} from '../../types.js';
import type {
  DeployAccountResponse,
  GetAccountResponse,
  GetBalanceResponse,
  GetDeploymentStatusResponse,
} from './account.types';

// =============================================================================
// Routes
// =============================================================================

export function createAccountRoutes(appCtx: AppContext): AuthenticatedHono {
  const log = appCtx.logger.child({name: 'account.routes.ts'});
  const app: AuthenticatedHono = new Hono();

  app.use('*', createAuthMiddleware(appCtx));

  const {accountDeployer, accountReader} = appCtx.useCases;

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

  app.post('/deploy', async (honoCtx): Promise<TypedResponse<DeployAccountResponse | ApiErrorResponse>> => {
    try {
      const account: Account = honoCtx.get('account');

      const result = await accountDeployer.deploy({
        accountId: account.id,
      });

      return honoCtx.json<DeployAccountResponse>({
        txHash: result.txHash,
        status: result.account.getStatus(),
        starknetAddress: result.account.requireStarknetAddress(),
      });
    } catch (error) {
      return handleDomainError(honoCtx, error, log);
    }
  });

  // ---------------------------------------------------------------------------
  // Get Deployment Status
  // ---------------------------------------------------------------------------

  app.get('/deployment-status', async (honoCtx): Promise<TypedResponse<GetDeploymentStatusResponse | ApiErrorResponse>> => {
    try {
      const account: Account = honoCtx.get('account');

      const result = await accountReader.getDeploymentStatus({accountId: account.id});

      return honoCtx.json<GetDeploymentStatusResponse>({
        status: result.status,
        txHash: result.txHash ?? null,
        isDeployed: result.isDeployed,
      });
    } catch (error) {
      return handleDomainError(honoCtx, error, log);
    }
  });

  app.get('/balance', async (honoCtx): Promise<TypedResponse<GetBalanceResponse | ApiErrorResponse>> => {
    try {
      const account: Account = honoCtx.get('account');

      const result = await accountReader.getBalance({accountId: account.id});

      return honoCtx.json<GetBalanceResponse>(result);
    } catch (error) {
      return handleDomainError(honoCtx, error, log);
    }
  });

  return app;
}
