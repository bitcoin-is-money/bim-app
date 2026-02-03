import {AccountAlreadyExistsError, AccountNotFoundError, InvalidUsernameError} from "@bim/domain/account";
import {
  AuthenticationFailedError,
  ChallengeExpiredError,
  ChallengeNotFoundError,
  InvalidSessionIdError,
  RegistrationFailedError,
  SessionExpiredError,
  SessionNotFoundError
} from "@bim/domain/auth";
import {Hono} from 'hono';
import type {TypedResponse} from 'hono';
import {z} from 'zod';
import type {AppContext} from "../../app-context";
import {BeginRegistrationSchema, CompleteAuthenticationSchema, CompleteRegistrationSchema} from "./auth.schemas";
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

  app.post('/register/begin', async (honoCtx): Promise<TypedResponse<BeginRegistrationResponse> | Response> => {
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
      return handleError(honoCtx, error);
    }
  });

  app.post('/register/complete', async (honoCtx): Promise<TypedResponse<CompleteRegistrationResponse> | Response> => {
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
      return handleError(honoCtx, error);
    }
  });

  // ---------------------------------------------------------------------------
  // Authentication
  // ---------------------------------------------------------------------------

  app.post('/login/begin', async (honoCtx): Promise<TypedResponse<BeginAuthenticationResponse> | Response> => {
    try {
      const result = await authService.beginAuthentication();

      return honoCtx.json<BeginAuthenticationResponse>({
        options: result.options,
        challengeId: result.challengeId,
      });
    } catch (error) {
      return handleError(honoCtx, error);
    }
  });

  app.post('/login/complete', async (honoCtx): Promise<TypedResponse<CompleteAuthenticationResponse> | Response> => {
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
      return handleError(honoCtx, error);
    }
  });

  // ---------------------------------------------------------------------------
  // Session
  // ---------------------------------------------------------------------------

  app.get('/session', async (honoCtx): Promise<TypedResponse<SessionResponse> | Response> => {
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
      return handleError(honoCtx, error);
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

function getSessionId(honoCtx: { req: { header: (name: string) => string | undefined } }): string | undefined {
  const cookie = honoCtx.req.header('Cookie');
  if (!cookie) return undefined;

  const match = /session=([^;]+)/.exec(cookie);
  return match?.[1];
}

function setCookie(honoCtx: { header: (name: string, value: string) => void }, sessionId: string): void {
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

function clearCookie(honoCtx: { header: (name: string, value: string) => void }): void {
  honoCtx.header('Set-Cookie', 'session=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict');
}

function handleError(honoCtx: { json: (data: unknown, status: number) => Response }, error: unknown): Response {
  // Log error safely - some error objects (like ZodError) can cause console.error to throw
  try {
    console.error('Auth error:', error);
  } catch {
    console.error('Auth error:', error instanceof Error ? error.message : String(error));
  }

  if (error instanceof z.ZodError) {
    return honoCtx.json(
      { error: { message: 'Validation error', details: error.errors } },
      400,
    );
  }

  if (error instanceof AccountAlreadyExistsError) {
    return honoCtx.json({ error: { message: 'Username already taken' } }, 409);
  }

  if (error instanceof InvalidUsernameError) {
    return honoCtx.json({ error: { message: error.message } }, 400);
  }

  if (error instanceof AccountNotFoundError) {
    return honoCtx.json({ error: { message: 'Account not found' } }, 404);
  }

  if (
    error instanceof ChallengeNotFoundError ||
    error instanceof ChallengeExpiredError
  ) {
    return honoCtx.json({ error: { message: 'Challenge expired or invalid' } }, 400);
  }

  if (
    error instanceof AuthenticationFailedError ||
    error instanceof RegistrationFailedError
  ) {
    return honoCtx.json({ error: { message: 'Authentication failed' } }, 401);
  }

  return honoCtx.json({ error: { message: 'Internal server error' } }, 500);
}
