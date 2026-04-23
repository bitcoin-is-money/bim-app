import {InvalidSessionIdError, SessionExpiredError, SessionNotFoundError} from "@bim/domain/auth";
import type {Context, Next} from 'hono';
import type {AppContext} from '../app-context';
import {type ApiErrorResponse, ErrorCode} from '../errors';
import type {AuthenticatedContext} from '../types';
import {setSessionCookie} from './session-cookie';

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
 * Also refreshes the session cookie on each request (sliding session).
 */
export function createAuthMiddleware(appContext: AppContext) {
  const {validateSession} = appContext.useCases;
  const maxAgeSec = Math.floor(appContext.sessionConfig.durationMs / 1000);

  return async (
    ctx: Context<{Variables: AuthenticatedContext}>,
    next: Next,
  ): Promise<Response | undefined> => {
    const sessionId = getSessionId(ctx);
    if (!sessionId) {
      return ctx.json<ApiErrorResponse>({error: {code: ErrorCode.UNAUTHORIZED, message: 'Missing session cookie'}}, 401);
    }

    try {
      const result = await validateSession.execute({sessionId});
      ctx.set('account', result.account);
      ctx.set('session', result.session);

      // Sliding session: refresh cookie expiry on each authenticated request
      setSessionCookie(ctx, result.session.id, maxAgeSec);

      await next();
    } catch (error) {
      if (error instanceof SessionExpiredError) {
        return ctx.json<ApiErrorResponse>({error: {code: ErrorCode.SESSION_EXPIRED, message: 'Session expired'}}, 401);
      }
      if (error instanceof SessionNotFoundError || error instanceof InvalidSessionIdError) {
        return ctx.json<ApiErrorResponse>({error: {code: ErrorCode.SESSION_NOT_FOUND, message: 'Session not found'}}, 401);
      }
      throw error;
    }
  };
}
