import {
  AccountAlreadyExistsError,
  AccountId,
  AccountNotFoundError,
  AuthenticationFailedError,
  ChallengeExpiredError,
  ChallengeNotFoundError,
  getBeginAuthenticationUseCase,
  getBeginRegistrationUseCase,
  getCompleteAuthenticationUseCase,
  getCompleteRegistrationUseCase,
  getLogoutUseCase,
  getValidateSessionUseCase,
  InvalidSessionIdError,
  InvalidUsernameError,
  RegistrationFailedError,
  SessionExpiredError,
  SessionNotFoundError,
} from '@bim/domain';
import {Hono} from 'hono';
import {z} from 'zod';
import type {AppContext} from "../../app-context";
import {
  BeginAuthenticationSchema,
  BeginRegistrationSchema,
  CompleteAuthenticationSchema,
  CompleteRegistrationSchema
} from "./auth.schemas";

// =============================================================================
// Routes
// =============================================================================

export function createAuthRoutes(appContext: AppContext): Hono {
  const app = new Hono();

  const { rpId, rpName, origin } = appContext.webauthn;

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  app.post('/register/begin', async (ctx) => {
    try {
      const body = await ctx.req.json();
      const input = BeginRegistrationSchema.parse(body);

      const beginRegistration = getBeginRegistrationUseCase({
        challengeRepository: appContext.repositories.challenge,
        idGenerator: () => AccountId.generate(),
      });

      const result = await beginRegistration({
        username: input.username,
        rpId,
        rpName,
        origin,
      });

      return ctx.json({
        options: result.options,
        challengeId: result.challengeId,
        accountId: result.accountId,
      });
    } catch (error) {
      return handleError(ctx, error);
    }
  });

  app.post('/register/complete', async (ctx) => {
    try {
      const body = await ctx.req.json();
      const input = CompleteRegistrationSchema.parse(body);

      const complete = getCompleteRegistrationUseCase({
        accountRepository: appContext.repositories.account,
        challengeRepository: appContext.repositories.challenge,
        sessionRepository: appContext.repositories.session,
        webAuthnGateway: appContext.gateways.webAuthn,
        starknetGateway: appContext.gateways.starknet,
      });

      const result = await complete({
        challengeId: input.challengeId,
        accountId: input.accountId,
        username: input.username,
        credential: input.credential,
      });

      // Set session cookie
      setCookie(ctx, result.session.id);

      return ctx.json({
        account: {
          id: result.account.id,
          username: result.account.username,
          starknetAddress: result.account.getStarknetAddress(),
          status: result.account.getStatus(),
        },
      });
    } catch (error) {
      return handleError(ctx, error);
    }
  });

  // ---------------------------------------------------------------------------
  // Authentication
  // ---------------------------------------------------------------------------

  app.post('/login/begin', async (ctx) => {
    try {
      const begin = getBeginAuthenticationUseCase({
        challengeRepository: appContext.repositories.challenge,
      });

      const result = await begin({
        rpId,
        origin,
      });

      return ctx.json({
        options: result.options,
        challengeId: result.challengeId,
      });
    } catch (error) {
      return handleError(ctx, error);
    }
  });

  app.post('/login/complete', async (ctx) => {
    try {
      const body = await ctx.req.json();
      const input = CompleteAuthenticationSchema.parse(body);

      const complete = getCompleteAuthenticationUseCase({
        accountRepository: appContext.repositories.account,
        challengeRepository: appContext.repositories.challenge,
        sessionRepository: appContext.repositories.session,
        webAuthnGateway: appContext.gateways.webAuthn,
      });

      const result = await complete({
        challengeId: input.challengeId,
        credential: input.credential,
      });

      // Set session cookie
      setCookie(ctx, result.session.id);

      return ctx.json({
        account: {
          id: result.account.id,
          username: result.account.username,
          starknetAddress: result.account.getStarknetAddress(),
          status: result.account.getStatus(),
        },
      });
    } catch (error) {
      return handleError(ctx, error);
    }
  });

  // ---------------------------------------------------------------------------
  // Session
  // ---------------------------------------------------------------------------

  app.get('/session', async (ctx) => {
    try {
      const sessionId = getSessionId(ctx);
      if (!sessionId) {
        return ctx.json({ authenticated: false }, 401);
      }

      const validate = getValidateSessionUseCase({
        sessionRepository: appContext.repositories.session,
        accountRepository: appContext.repositories.account,
      });

      const result = await validate({ sessionId });

      return ctx.json({
        authenticated: true,
        account: {
          id: result.account.id,
          username: result.account.username,
          starknetAddress: result.account.getStarknetAddress(),
          status: result.account.getStatus(),
        },
      });
    } catch (error) {
      if (
        error instanceof SessionExpiredError ||
        error instanceof SessionNotFoundError ||
        error instanceof InvalidSessionIdError
      ) {
        clearCookie(ctx);
        return ctx.json({ authenticated: false }, 401);
      }
      return handleError(ctx, error);
    }
  });

  app.post('/logout', async (ctx) => {
    try {
      const sessionId = getSessionId(ctx);
      if (sessionId) {
        const logout = getLogoutUseCase({
          sessionRepository: appContext.repositories.session,
        });
        await logout({ sessionId });
      }

      clearCookie(ctx);
      return ctx.json({ success: true });
    } catch (error) {
      console.error("Logout error :", error);
      clearCookie(ctx);
      return ctx.json({ success: true });
    }
  });
  return app;
}

// =============================================================================
// Helpers
// =============================================================================

function getSessionId(ctx: { req: { header: (name: string) => string | undefined } }): string | undefined {
  const cookie = ctx.req.header('Cookie');
  if (!cookie) return undefined;

  const match = /session=([^;]+)/.exec(cookie);
  return match?.[1];
}

function setCookie(c: { header: (name: string, value: string) => void }, sessionId: string): void {
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

  c.header('Set-Cookie', cookie);
}

function clearCookie(ctx: { header: (name: string, value: string) => void }): void {
  ctx.header('Set-Cookie', 'session=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict');
}

function handleError(ctx: { json: (data: unknown, status: number) => Response }, error: unknown): Response {
  // Log error safely - some error objects (like ZodError) can cause console.error to throw
  try {
    console.error('Auth error:', error);
  } catch {
    console.error('Auth error:', error instanceof Error ? error.message : String(error));
  }

  if (error instanceof z.ZodError) {
    return ctx.json(
      { error: { message: 'Validation error', details: error.errors } },
      400,
    );
  }

  if (error instanceof AccountAlreadyExistsError) {
    return ctx.json({ error: { message: 'Username already taken' } }, 409);
  }

  if (error instanceof InvalidUsernameError) {
    return ctx.json({ error: { message: error.message } }, 400);
  }

  if (error instanceof AccountNotFoundError) {
    return ctx.json({ error: { message: 'Account not found' } }, 404);
  }

  if (
    error instanceof ChallengeNotFoundError ||
    error instanceof ChallengeExpiredError
  ) {
    return ctx.json({ error: { message: 'Challenge expired or invalid' } }, 400);
  }

  if (
    error instanceof AuthenticationFailedError ||
    error instanceof RegistrationFailedError
  ) {
    return ctx.json({ error: { message: 'Authentication failed' } }, 401);
  }

  return ctx.json({ error: { message: 'Internal server error' } }, 500);
}
