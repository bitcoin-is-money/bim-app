import {Account, AccountId} from '@bim/domain/account';
import type {TypedResponse} from 'hono';
import {Hono} from 'hono';

import type {AppContext} from '../../app-context';
import {type ApiErrorResponse, createErrorResponse, ErrorCode, handleDomainError} from '../../errors';
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
  const log = appCtx.logger.child({name: 'account.routes.ts'});
  const app: AuthenticatedHono = new Hono();

  app.use('*', createAuthMiddleware(appCtx));

  // Service from AppContext (initialized once at startup)
  const {account: accountService} = appCtx.services;

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
      const body: DeployAccountRequest = await honoCtx.req.json().catch(() => ({}));
      const sync = body.sync === true;

      const result = await accountService.deploy({
        accountId: AccountId.of(account.id),
        sync,
      });

      return honoCtx.json<DeployAccountResponse>({
        txHash: result.txHash,
        status: result.account.getStatus(),
        starknetAddress: result.account.getStarknetAddress()!,
      });
    } catch (error) {
      return handleDomainError(honoCtx, error, log);
    }
  });

  // ---------------------------------------------------------------------------
  // Get Deployment Status
  // ---------------------------------------------------------------------------

  app.get('/deployment-status', async (honoCtx): Promise<TypedResponse<GetDeploymentStatusResponse | ApiErrorResponse>> => {
    const account: Account = honoCtx.get('account');

    // Reload account to get the latest status
    const freshAccount: Account | undefined = await appCtx.repositories.account.findById(
      AccountId.of(account.id),
    );

    if (!freshAccount) {
      return createErrorResponse(honoCtx, 404, ErrorCode.ACCOUNT_NOT_FOUND, 'Account not found');
    }

    return honoCtx.json<GetDeploymentStatusResponse>({
      status: freshAccount.getStatus(),
      txHash: freshAccount.getDeploymentTxHash() ?? null,
      isDeployed: freshAccount.isDeployed(),
    });
  });

  app.get('/balance', async (honoCtx): Promise<TypedResponse<GetBalanceResponse | ApiErrorResponse>> => {
    try {
      const account: Account = honoCtx.get('account');

      const result = await accountService.getBalance({accountId: account.id});

      return honoCtx.json<GetBalanceResponse>(result);
    } catch (error) {
      return handleDomainError(honoCtx, error, log);
    }
  });

  return app;
}
