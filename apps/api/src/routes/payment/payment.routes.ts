import {Hono} from 'hono';
import type {AppContext} from '../../app-context';
import {createAuthMiddleware} from '../../middleware/auth.middleware';
import type {AuthenticatedHono} from '../../types';
import {createPayRoutes} from './pay/pay.routes';
import {createReceiveRoutes} from './receive/receive.routes';

// =============================================================================
// Routes
// =============================================================================

export function createPaymentRoutes(appContext: AppContext): AuthenticatedHono {
  const app: AuthenticatedHono = new Hono();

  app.use('*', createAuthMiddleware(appContext));

  app.route('/pay', createPayRoutes(appContext));
  app.route('/receive', createReceiveRoutes(appContext));

  return app;
}
