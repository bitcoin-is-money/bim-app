import {Hono} from 'hono';
import type {AppContext} from "../app-context";
import {createAuthMiddleware} from '../middleware/auth.middleware';
import type {AuthenticatedHono} from '../types.js';

export function createBalanceRoutes(appContext: AppContext): AuthenticatedHono {
  const app: AuthenticatedHono = new Hono();

  app.use('*', createAuthMiddleware(appContext));

  app.get('/', async (ctx) => {
    try {
      // TODO: Implement real balance retrieval from the account
      // For now, return mocked data
      return ctx.json({
        amount: 1250.50,
        currency: 'USD',
      });
    } catch (error) {
      console.error('Balance error:', error);
      return ctx.json({error: 'Internal server error'}, 500);
    }
  });

  return app;
}
