import {Hono} from 'hono';
import type {AppContext} from '../../app-context';
import {createAuthMiddleware} from '../../middleware/auth.middleware';
import type {AuthenticatedHono} from '../../types';
import {createSettingsRoutes} from './settings/settings.routes';
import {createTransactionRoutes} from './transactions/transaction.routes';

// =============================================================================
// Routes
// =============================================================================

export function createUserRoutes(appContext: AppContext): AuthenticatedHono {
  const app: AuthenticatedHono = new Hono();

  app.use('*', createAuthMiddleware(appContext));

  app.route('/settings', createSettingsRoutes(appContext));
  app.route('/transactions', createTransactionRoutes(appContext));

  return app;
}
