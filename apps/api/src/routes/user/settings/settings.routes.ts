import type {Account} from '@bim/domain/account';
import {FiatCurrency} from '@bim/domain/currency';
import {Language} from '@bim/domain/user';
import type {TypedResponse} from 'hono';
import {Hono} from 'hono';

import type {AppContext} from '../../../app-context';
import {type ApiErrorResponse, handleDomainError} from '../../../errors';
import type {AuthenticatedHono} from '../../../types.js';
import type {GetSettingsResponse, UpdateSettingsBody, UpdateSettingsResponse} from './settings.types';
import {UpdateSettingsSchema} from './settings.types';

// =============================================================================
// Routes
// =============================================================================

export function createSettingsRoutes(appContext: AppContext): AuthenticatedHono {
  const log = appContext.logger.child({name: 'settings.routes.ts'});
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
        preferredCurrencies: result.settings.getPreferredCurrencies(),
        defaultCurrency: result.settings.getDefaultCurrency(),
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
      const body: UpdateSettingsBody = UpdateSettingsSchema.parse(await honoCtx.req.json());

      const result = await userSettingsService.update({
        accountId: account.id,
        ...(body.language !== undefined && {
          language: Language.of(body.language)
        }),
        ...(body.preferredCurrencies !== undefined && {
          preferredCurrencies: FiatCurrency.ofAll(body.preferredCurrencies)
        }),
        ...(body.defaultCurrency !== undefined && {
          defaultCurrency: FiatCurrency.of(body.defaultCurrency)
        }),
      });

      return honoCtx.json<UpdateSettingsResponse>({
        language: result.settings.getLanguage(),
        preferredCurrencies: result.settings.getPreferredCurrencies(),
        defaultCurrency: result.settings.getDefaultCurrency(),
      });
    } catch (error) {
      return handleDomainError(honoCtx, error, log);
    }
  });

  return app;
}
