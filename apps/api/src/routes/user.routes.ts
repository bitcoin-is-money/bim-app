import {
  Account,
  FiatCurrency,
  getFetchUserSettingsUseCase,
  getUpdateUserSettingsUseCase,
  UnsupportedCurrencyError,
  UserSettingsId,
} from '@bim/domain';
import {Hono} from 'hono';
import type {AppContext} from "../app-context";
import {createAuthMiddleware} from '../middleware/auth.middleware';
import type {AuthenticatedHono} from '../types.js';

// =============================================================================
// Routes
// =============================================================================

export function createUserRoutes(appContext: AppContext): AuthenticatedHono {
  const app: AuthenticatedHono = new Hono();

  app.use('*', createAuthMiddleware(appContext));

  // ---------------------------------------------------------------------------
  // Get User Settings
  // ---------------------------------------------------------------------------

  app.get('/settings', async (ctx) => {
    try {
      const account: Account = ctx.get('account');

      const fetchSettings = getFetchUserSettingsUseCase({
        userSettingsRepository: appContext.repositories.userSettings,
        idGenerator: UserSettingsId.generate,
      });

      const result = await fetchSettings({accountId: account.id});

      return ctx.json({
        fiatCurrency: result.settings.getFiatCurrency(),
        supportedCurrencies: FiatCurrency.getSupportedCurrencies(),
      });
    } catch (error) {
      return handleError(ctx, error);
    }
  });

  // ---------------------------------------------------------------------------
  // Update User Settings
  // ---------------------------------------------------------------------------

  app.put('/settings', async (ctx) => {
    try {
      const account: Account = ctx.get('account');
      const body = await ctx.req.json();

      const updateSettings = getUpdateUserSettingsUseCase({
        userSettingsRepository: appContext.repositories.userSettings,
        idGenerator: UserSettingsId.generate,
      });

      const result = await updateSettings({
        accountId: account.id,
        fiatCurrency: body.fiatCurrency,
      });

      return ctx.json({
        fiatCurrency: result.settings.getFiatCurrency(),
        supportedCurrencies: FiatCurrency.getSupportedCurrencies(),
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

function handleError(
  ctx: {json: (data: unknown, status: number) => Response},
  error: unknown
): Response {
  console.error('User settings error:', error);

  if (error instanceof UnsupportedCurrencyError) {
    return ctx.json({error: error.message}, 400);
  }

  return ctx.json({error: 'Internal server error'}, 500);
}
