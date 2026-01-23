import {
  Account,
  FiatCurrency,
  getFetchUserSettingsUseCase,
  getUpdateUserSettingsUseCase,
  SessionExpiredError,
  SessionNotFoundError,
  UnsupportedCurrencyError,
  UserSettingsId,
  validateSession,
  type ValidateSessionOutput,
} from '@bim/domain';
import {Hono} from 'hono';
import type {AppContext} from "../app-context";
import type {AuthenticatedHono} from '../types.js';

// =============================================================================
// Routes
// =============================================================================

export function createUserRoutes(appContext: AppContext): AuthenticatedHono {
  const app: AuthenticatedHono = new Hono();

  // Middleware: Require authentication
  app.use('*', async (ctx, next) => {
    const sessionId = getSessionId(ctx);
    if (!sessionId) {
      return ctx.json({error: 'Unauthorized'}, 401);
    }

    try {
      const validate = validateSession({
        sessionRepository: appContext.repositories.session,
        accountRepository: appContext.repositories.account,
      });

      const result: ValidateSessionOutput = await validate({sessionId});
      ctx.set('account', result.account);
      ctx.set('session', result.session);
      await next();
    } catch (error) {
      if (
        error instanceof SessionExpiredError ||
        error instanceof SessionNotFoundError
      ) {
        return ctx.json({error: 'Session expired'}, 401);
      }
      throw error;
    }
  });

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

function getSessionId(ctx: {req: {header: (name: string) => string | undefined}}): string | undefined {
  const cookie = ctx.req.header('Cookie');
  if (!cookie) return undefined;

  const match = /session=([^;]+)/.exec(cookie);
  return match?.[1];
}

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
