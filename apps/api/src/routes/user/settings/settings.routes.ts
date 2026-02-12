import {Account} from '@bim/domain/account';
import {FiatCurrency, Language} from '@bim/domain/user';
import {Hono} from 'hono';
import type {TypedResponse} from 'hono';
import {basename} from 'node:path';
import type {AppContext} from '../../../app-context';
import {handleDomainError, type ApiErrorResponse} from '../../../errors';
import type {AuthenticatedHono} from '../../../types.js';
import type {GetSettingsResponse, UpdateSettingsResponse} from './settings.types';

// =============================================================================
// Routes
// =============================================================================

export function createSettingsRoutes(appContext: AppContext): AuthenticatedHono {
  const log = appContext.logger.child({name: basename(import.meta.filename)});
  const app: AuthenticatedHono = new Hono();

  // Service from AppContext (initialized once at startup)
  const {userSettings: userSettingsService} = appContext.services;

  // ---------------------------------------------------------------------------
  // Get User Settings
  // ---------------------------------------------------------------------------

  app.get('/', async (honoCtx): Promise<TypedResponse<GetSettingsResponse | ApiErrorResponse>> => {
    try {
      const account: Account = honoCtx.get('account');

      const result = await userSettingsService.fetch({accountId: account.id});

      return honoCtx.json<GetSettingsResponse>({
        language: result.settings.getLanguage(),
        supportedLanguages: Language.getSupportedLanguages(),
        fiatCurrency: result.settings.getFiatCurrency(),
        supportedCurrencies: FiatCurrency.getSupportedCurrencies(),
      });
    } catch (error) {
      return handleDomainError(honoCtx, error, log);
    }
  });

  // ---------------------------------------------------------------------------
  // Update User Settings
  // ---------------------------------------------------------------------------

  app.put('/', async (honoCtx): Promise<TypedResponse<UpdateSettingsResponse | ApiErrorResponse>> => {
    try {
      const account: Account = honoCtx.get('account');
      const body = await honoCtx.req.json();

      const result = await userSettingsService.update({
        accountId: account.id,
        language: body.language,
        fiatCurrency: body.fiatCurrency,
      });

      return honoCtx.json<UpdateSettingsResponse>({
        language: result.settings.getLanguage(),
        supportedLanguages: Language.getSupportedLanguages(),
        fiatCurrency: result.settings.getFiatCurrency(),
        supportedCurrencies: FiatCurrency.getSupportedCurrencies(),
      });
    } catch (error) {
      return handleDomainError(honoCtx, error, log);
    }
  });

  return app;
}
