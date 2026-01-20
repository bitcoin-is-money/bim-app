import {Hono} from 'hono';
import type {AppEnv} from '../types.js';

export function createTransactionRoutes(env: AppEnv): Hono {
  const app = new Hono();

  app.get('/', async (ctx) => {
    try {
      // TODO: Récupérer le compte depuis la session
      // Pour l'instant, on retourne des données mockées
      const sessionId = getSessionId(ctx);
      if (!sessionId) {
        return ctx.json({ error: 'Unauthorized' }, 401);
      }

      // TODO: Implémenter la récupération des transactions réelles depuis le compte
      // Pour l'instant, on retourne des données mockées
      return ctx.json([
        {
          id: '1',
          date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          name: 'Achat en ligne',
          amount: -45.99,
        },
        {
          id: '2',
          date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
          name: 'Virement reçu',
          amount: 500.00,
        },
        {
          id: '3',
          date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          name: 'Paiement restaurant',
          amount: -32.50,
        },
        {
          id: '4',
          date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
          name: 'Dépôt initial',
          amount: 1000.00,
        },
      ]);
    } catch (error) {
      console.error('Transaction error:', error);
      return ctx.json({ error: 'Internal server error' }, 500);
    }
  });

  return app;
}

function getSessionId(ctx: { req: { header: (name: string) => string | undefined } }): string | undefined {
  const cookie = ctx.req.header('Cookie');
  if (!cookie) return undefined;

  const match = /session=([^;]+)/.exec(cookie);
  return match?.[1];
}
