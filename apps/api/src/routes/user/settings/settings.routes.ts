import {Account} from '@bim/domain/account';
import {FiatCurrency, UnsupportedCurrencyError} from "@bim/domain/user";
import {Hono} from 'hono';
import type {TypedResponse} from 'hono';
import type {AppContext} from '../../../app-context';
import type {AuthenticatedHono} from '../../../types.js';
import type {GetSettingsResponse, UpdateSettingsResponse} from './settings.types';

// =============================================================================
// Routes
// =============================================================================

export function createSettingsRoutes(appContext: AppContext): AuthenticatedHono {
  const app: AuthenticatedHono = new Hono();

  // Service from AppContext (initialized once at startup)
  const {userSettings: userSettingsService} = appContext.services;

  // ---------------------------------------------------------------------------
  // Get User Settings
  // ---------------------------------------------------------------------------

  app.get('/', async (honoCtx): Promise<TypedResponse<GetSettingsResponse> | Response> => {
    try {
      const account: Account = honoCtx.get('account');

      const result = await userSettingsService.fetch({accountId: account.id});

      return honoCtx.json<GetSettingsResponse>({
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

  app.put('/', async (honoCtx): Promise<TypedResponse<UpdateSettingsResponse> | Response> => {
    try {
      const account: Account = honoCtx.get('account');
      const body = await honoCtx.req.json();

      const result = await userSettingsService.update({
        accountId: account.id,
        fiatCurrency: body.fiatCurrency,
      });

      return honoCtx.json<UpdateSettingsResponse>({
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
