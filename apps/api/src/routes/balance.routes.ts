import {Hono} from 'hono';
import type {AppContext} from "../app-context";

export function createBalanceRoutes(appContext: AppContext): Hono {
  const app = new Hono();

  app.get('/', async (ctx) => {
    try {
      // TODO: Récupérer le compte depuis la session
      // Pour l'instant, on retourne des données mockées
      const sessionId = getSessionId(ctx);
      if (!sessionId) {
        return ctx.json({ error: 'Unauthorized' }, 401);
      }

      // TODO: Implémenter la récupération du solde réel depuis le compte
      // Pour l'instant, on retourne des données mockées
      return ctx.json({
        amount: 1250.50,
        currency: 'USD',
      });
    } catch (error) {
      console.error('Balance error:', error);
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
