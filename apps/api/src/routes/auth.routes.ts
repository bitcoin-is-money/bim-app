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
  InvalidUsernameError,
  logout,
  RegistrationFailedError,
  SessionExpiredError,
  SessionNotFoundError,
  Username,
  validateSession,
} from '@bim/domain';
import {Hono} from 'hono';
import {z} from 'zod';
import type {AppEnv} from '../types.js';

// =============================================================================
// Validation Schemas
// =============================================================================

const usernameSchema = z
  .string()
  .regex(
    Username.PATTERN,
    'Username must be 3-20 characters, alphanumeric and underscores only',
  );

const BeginRegistrationSchema = z.object({
  username: usernameSchema,
});

const CompleteRegistrationSchema = z.object({
  challengeId: z.string().uuid(),
  username: usernameSchema,
  credential: z.object({
    id: z.string(),
    rawId: z.string(),
    response: z.object({
      clientDataJSON: z.string(),
      attestationObject: z.string(),
    }),
    type: z.literal('public-key'),
  }),
});

const BeginAuthenticationSchema = z.object({
  username: usernameSchema,
});

const CompleteAuthenticationSchema = z.object({
  challengeId: z.string().uuid(),
  credential: z.object({
    id: z.string(),
    rawId: z.string(),
    response: z.object({
      clientDataJSON: z.string(),
      authenticatorData: z.string(),
      signature: z.string(),
      userHandle: z.string().optional(),
    }),
    type: z.literal('public-key'),
  }),
});

// =============================================================================
// Routes
// =============================================================================

export function createAuthRoutes(env: AppEnv): Hono {
  const app = new Hono();

  const { rpId, rpName, origin } = env.webauthn;

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  app.post('/register/begin', async (ctx) => {
    try {
      const body = await ctx.req.json();
      const input = BeginRegistrationSchema.parse(body);

      const begin = getBeginRegistrationUseCase({
        challengeRepository: env.repositories.challenge,
      });

      const result = await begin({
        username: input.username,
        rpId,
        rpName,
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

  app.post('/register/complete', async (ctx) => {
    try {
      const body = await ctx.req.json();
      const input = CompleteRegistrationSchema.parse(body);

      const complete = getCompleteRegistrationUseCase({
        accountRepository: env.repositories.account,
        challengeRepository: env.repositories.challenge,
        sessionRepository: env.repositories.session,
        webAuthnGateway: env.gateways.webAuthn,
        starknetGateway: env.gateways.starknet,
        idGenerator: () => AccountId.generate(),
      });

      const result = await complete({
        challengeId: input.challengeId,
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
      const body = await ctx.req.json();
      const input = BeginAuthenticationSchema.parse(body);

      const begin = getBeginAuthenticationUseCase({
        accountRepository: env.repositories.account,
        challengeRepository: env.repositories.challenge,
      });

      const result = await begin({
        username: input.username,
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
        accountRepository: env.repositories.account,
        challengeRepository: env.repositories.challenge,
        sessionRepository: env.repositories.session,
        webAuthnGateway: env.gateways.webAuthn,
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

      const validate = validateSession({
        sessionRepository: env.repositories.session,
        accountRepository: env.repositories.account,
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
        error instanceof SessionNotFoundError
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
        const doLogout = logout({
          sessionRepository: env.repositories.session,
        });

        await doLogout({ sessionId });
      }

      clearCookie(ctx);
      return ctx.json({ success: true });
    } catch (error) {
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
  console.error('Auth error:', error);

  if (error instanceof z.ZodError) {
    return ctx.json(
      { error: 'Validation error', details: error.errors },
      400,
    );
  }

  if (error instanceof AccountAlreadyExistsError) {
    return ctx.json({error: 'Username already taken'}, 409);
  }

  if (error instanceof InvalidUsernameError) {
    return ctx.json({error: error.message}, 400);
  }

  if (error instanceof AccountNotFoundError) {
    return ctx.json({ error: 'Account not found' }, 404);
  }

  if (
    error instanceof ChallengeNotFoundError ||
    error instanceof ChallengeExpiredError
  ) {
    return ctx.json({ error: 'Challenge expired or invalid' }, 400);
  }

  if (
    error instanceof AuthenticationFailedError ||
    error instanceof RegistrationFailedError
  ) {
    return ctx.json({ error: 'Authentication failed' }, 401);
  }

  return ctx.json({ error: 'Internal server error' }, 500);
}
