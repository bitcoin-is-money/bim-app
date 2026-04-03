import {Hono} from 'hono';
import type {AppContext} from '../../app-context';
import {createAuthMiddleware} from '../../middleware/auth.middleware';
import type {SwapMonitor} from '../../monitoring/swap.monitor';
import type {AuthenticatedHono} from '../../types';
import {createPayRoutes} from './pay/pay.routes';
import {createReceiveRoutes} from './receive/receive.routes';

// =============================================================================
// Routes
// =============================================================================

export function createPaymentRoutes(
  appContext: AppContext,
  swapMonitor?: SwapMonitor | null,
): AuthenticatedHono {
  const app: AuthenticatedHono = new Hono();

  app.use('*', createAuthMiddleware(appContext));

  app.route('/pay', createPayRoutes(appContext, swapMonitor));
  app.route('/receive', createReceiveRoutes(appContext, swapMonitor));

  return app;
}
