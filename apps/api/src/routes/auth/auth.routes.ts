import {InvalidSessionIdError, SessionExpiredError, SessionNotFoundError} from '@bim/domain/auth';
import {Hono} from 'hono';
import type {TypedResponse} from 'hono';
import type {AppContext} from '../../app-context';
import {handleDomainError, type ApiErrorResponse} from '../../errors';
import {BeginRegistrationSchema, CompleteAuthenticationSchema, CompleteRegistrationSchema} from './auth.schemas';
import type {
  BeginAuthenticationResponse,
  BeginRegistrationResponse,
  CompleteAuthenticationResponse,
  CompleteRegistrationResponse,
  LogoutResponse,
  SessionResponse,
} from './auth.types';

// =============================================================================
// Routes
// =============================================================================

export function createAuthRoutes(appContext: AppContext): Hono {
  const app = new Hono();

  // Services from AppContext (initialized once at startup)
  const {auth: authService, session: sessionService} = appContext.services;

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  app.post('/register/begin', async (honoCtx): Promise<TypedResponse<BeginRegistrationResponse | ApiErrorResponse>> => {
    try {
      const body = await honoCtx.req.json();
      const input = BeginRegistrationSchema.parse(body);

      const result = await authService.beginRegistration({
        username: input.username,
      });

      return honoCtx.json<BeginRegistrationResponse>({
        options: result.options,
        challengeId: result.challengeId,
        accountId: result.accountId,
      });
    } catch (error) {
      return handleDomainError(honoCtx, error);
    }
  });

  app.post('/register/complete', async (honoCtx): Promise<TypedResponse<CompleteRegistrationResponse | ApiErrorResponse>> => {
    try {
      const body = await honoCtx.req.json();
      const input = CompleteRegistrationSchema.parse(body);

      const result = await authService.completeRegistration({
        challengeId: input.challengeId,
        accountId: input.accountId,
        username: input.username,
        credential: input.credential,
      });

      // Set session cookie
      setCookie(honoCtx, result.session.id);

      return honoCtx.json<CompleteRegistrationResponse>({
        account: {
          id: result.account.id,
          username: result.account.username,
          starknetAddress: result.account.getStarknetAddress() ?? null,
          status: result.account.getStatus(),
        },
      });
    } catch (error) {
      return handleDomainError(honoCtx, error);
    }
  });

  // ---------------------------------------------------------------------------
  // Authentication
  // ---------------------------------------------------------------------------

  app.post('/login/begin', async (honoCtx): Promise<TypedResponse<BeginAuthenticationResponse | ApiErrorResponse>> => {
    try {
      const result = await authService.beginAuthentication();

      return honoCtx.json<BeginAuthenticationResponse>({
        options: result.options,
        challengeId: result.challengeId,
      });
    } catch (error) {
      return handleDomainError(honoCtx, error);
    }
  });

  app.post('/login/complete', async (honoCtx): Promise<TypedResponse<CompleteAuthenticationResponse | ApiErrorResponse>> => {
    try {
      const body = await honoCtx.req.json();
      const input = CompleteAuthenticationSchema.parse(body);

      const result = await authService.completeAuthentication({
        challengeId: input.challengeId,
        credential: input.credential,
      });

      // Set session cookie
      setCookie(honoCtx, result.session.id);

      return honoCtx.json<CompleteAuthenticationResponse>({
        account: {
          id: result.account.id,
          username: result.account.username,
          starknetAddress: result.account.getStarknetAddress() ?? null,
          status: result.account.getStatus(),
        },
      });
    } catch (error) {
      return handleDomainError(honoCtx, error);
    }
  });

  // ---------------------------------------------------------------------------
  // Session
  // ---------------------------------------------------------------------------

  app.get('/session', async (honoCtx): Promise<TypedResponse<SessionResponse | ApiErrorResponse>> => {
    try {
      const sessionId = getSessionId(honoCtx);
      if (!sessionId) {
        return honoCtx.json({authenticated: false}, 401);
      }

      const result = await sessionService.validate({sessionId});

      return honoCtx.json<SessionResponse>({
        authenticated: true,
        account: {
          id: result.account.id,
          username: result.account.username,
          starknetAddress: result.account.getStarknetAddress() ?? null,
          status: result.account.getStatus(),
        },
      });
    } catch (error) {
      if (
        error instanceof SessionExpiredError ||
        error instanceof SessionNotFoundError ||
        error instanceof InvalidSessionIdError
      ) {
        clearCookie(honoCtx);
        return honoCtx.json({authenticated: false}, 401);
      }
      return handleDomainError(honoCtx, error);
    }
  });

  app.post('/logout', async (honoCtx): Promise<TypedResponse<LogoutResponse>> => {
    try {
      const sessionId = getSessionId(honoCtx);
      if (sessionId) {
        await sessionService.invalidate({sessionId});
      }

      clearCookie(honoCtx);
      return honoCtx.json<LogoutResponse>({success: true});
    } catch (error) {
      console.error('Logout error:', error);
      clearCookie(honoCtx);
      return honoCtx.json<LogoutResponse>({success: true});
    }
  });

  return app;
}

// =============================================================================
// Helpers
// =============================================================================

function getSessionId(honoCtx: {req: {header: (name: string) => string | undefined}}): string | undefined {
  const cookie = honoCtx.req.header('Cookie');
  if (!cookie) return undefined;

  const match = /session=([^;]+)/.exec(cookie);
  return match?.[1];
}

function setCookie(honoCtx: {header: (name: string, value: string) => void}, sessionId: string): void {
  const isProduction = process.env.NODE_ENV === 'production';
  const maxAge = 7 * 24 * 60 * 60; // 7 days

  const cookie = [
    `session=${sessionId}`,
    'Path=/',
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Strict',
    isProduction ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');

  honoCtx.header('Set-Cookie', cookie);
}

function clearCookie(honoCtx: {header: (name: string, value: string) => void}): void {
  honoCtx.header('Set-Cookie', 'session=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict');
}
