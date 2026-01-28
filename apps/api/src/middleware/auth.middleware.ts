import {InvalidSessionIdError, SessionExpiredError, SessionNotFoundError} from "@bim/domain/auth";
import type {Context, Next} from 'hono';
import type {AppContext} from '../app-context';
import type {AuthenticatedContext} from '../types';

/**
 * Extracts session ID from the Cookie header.
 */
export function getSessionId(
  ctx: {req: {header: (name: string) => string | undefined}},
): string | undefined {
  const cookie = ctx.req.header('Cookie');
  if (!cookie) return undefined;

  const match = /session=([^;]+)/.exec(cookie);
  return match?.[1];
}

/**
 * Creates an authentication middleware that validates the session
 * and sets the account/session in context.
 */
export function createAuthMiddleware(appContext: AppContext) {
  const {session: sessionService} = appContext.services;

  return async (
    ctx: Context<{Variables: AuthenticatedContext}>,
    next: Next,
  ): Promise<Response | void> => {
    const sessionId = getSessionId(ctx);
    if (!sessionId) {
      return ctx.json({error: 'Unauthorized'}, 401);
    }

    try {
      const result = await sessionService.validate({sessionId});
      ctx.set('account', result.account);
      ctx.set('session', result.session);
      await next();
    } catch (error) {
      if (
        error instanceof SessionExpiredError ||
        error instanceof SessionNotFoundError ||
        error instanceof InvalidSessionIdError
      ) {
        return ctx.json({error: 'Session expired'}, 401);
      }
      throw error;
    }
  };
}
