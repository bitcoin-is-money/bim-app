import {
  Account,
  FiatCurrency,
  getFetchUserSettingsService,
  getUpdateUserSettingsService,
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

  app.get('/settings', async (honoCtx) => {
    try {
      const account: Account = honoCtx.get('account');

      const fetchSettings = getFetchUserSettingsService({
        userSettingsRepository: appContext.repositories.userSettings,
        idGenerator: UserSettingsId.generate,
      });

      const result = await fetchSettings({accountId: account.id});

      return honoCtx.json({
        fiatCurrency: result.settings.getFiatCurrency(),
        supportedCurrencies: FiatCurrency.getSupportedCurrencies(),
      });
    } catch (error) {
      return handleError(honoCtx, error);
    }
  });

  // ---------------------------------------------------------------------------
  // Update User Settings
  // ---------------------------------------------------------------------------

  app.put('/settings', async (honoCtx) => {
    try {
      const account: Account = honoCtx.get('account');
      const body = await honoCtx.req.json();

      const updateSettings = getUpdateUserSettingsService({
        userSettingsRepository: appContext.repositories.userSettings,
        idGenerator: UserSettingsId.generate,
      });

      const result = await updateSettings({
        accountId: account.id,
        fiatCurrency: body.fiatCurrency,
      });

      return honoCtx.json({
        fiatCurrency: result.settings.getFiatCurrency(),
        supportedCurrencies: FiatCurrency.getSupportedCurrencies(),
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

function handleError(
  honoCtx: {json: (data: unknown, status: number) => Response},
  error: unknown
): Response {
  console.error('User settings error:', error);

  if (error instanceof UnsupportedCurrencyError) {
    return honoCtx.json({error: error.message}, 400);
  }

  return honoCtx.json({error: 'Internal server error'}, 500);
}
