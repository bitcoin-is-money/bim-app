import {InvalidSessionIdError, SessionExpiredError, SessionNotFoundError} from '@bim/domain/auth';
import type {TypedResponse} from 'hono';
import {Hono} from 'hono';

import type {AppContext} from '../../app-context';
import {type ApiErrorResponse, handleDomainError} from '../../errors';
import {getSessionId} from '../../middleware/auth.middleware';
import {clearSessionCookie, setSessionCookie} from '../../middleware/session-cookie';
import type {
  BeginAuthenticationResponse,
  BeginRegistrationBody,
  BeginRegistrationResponse,
  CompleteAuthenticationBody,
  CompleteAuthenticationResponse,
  CompleteRegistrationBody,
  CompleteRegistrationResponse,
  LogoutResponse,
  SessionResponse,
} from './auth.types';
import {BeginRegistrationSchema, CompleteAuthenticationSchema, CompleteRegistrationSchema,} from './auth.types';

// =============================================================================
// Routes
// =============================================================================

export function createAuthRoutes(appContext: AppContext): Hono {
  const app = new Hono();
  const log = appContext.logger.child({name: 'auth.routes.ts'});

  const {registrar, authenticator, sessionValidator, sessionInvalidator} = appContext.useCases;
  const maxAgeSec = Math.floor(appContext.sessionConfig.durationMs / 1000);

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  app.post('/register/begin', async (honoCtx): Promise<TypedResponse<BeginRegistrationResponse | ApiErrorResponse>> => {
    try {
      const input: BeginRegistrationBody = BeginRegistrationSchema.parse(await honoCtx.req.json());

      const result = await registrar.begin({
        username: input.username,
      });

      return honoCtx.json<BeginRegistrationResponse>({
        options: result.options,
        challengeId: result.challengeId,
        accountId: result.accountId,
      });
    } catch (error) {
      return handleDomainError(honoCtx, error, log);
    }
  });

  app.post('/register/complete', async (honoCtx): Promise<TypedResponse<CompleteRegistrationResponse | ApiErrorResponse>> => {
    try {
      const input: CompleteRegistrationBody = CompleteRegistrationSchema.parse(await honoCtx.req.json());

      const result = await registrar.complete({
        challengeId: input.challengeId,
        accountId: input.accountId,
        username: input.username,
        credential: input.credential,
      });

      // Set session cookie
      setSessionCookie(honoCtx, result.session.id, maxAgeSec);

      return honoCtx.json<CompleteRegistrationResponse>({
        account: {
          id: result.account.id,
          username: result.account.username,
          starknetAddress: result.account.getStarknetAddress() ?? null,
          status: result.account.getStatus(),
        },
      });
    } catch (error) {
      return handleDomainError(honoCtx, error, log);
    }
  });

  // ---------------------------------------------------------------------------
  // Authentication
  // ---------------------------------------------------------------------------

  app.post('/login/begin', async (honoCtx): Promise<TypedResponse<BeginAuthenticationResponse | ApiErrorResponse>> => {
    try {
      const result = await authenticator.begin();

      const response: BeginAuthenticationResponse = {
        options: result.options,
        challengeId: result.challengeId,
      };
      return honoCtx.json(response) as TypedResponse<BeginAuthenticationResponse>;
    } catch (error) {
      return handleDomainError(honoCtx, error, log);
    }
  });

  app.post('/login/complete', async (honoCtx): Promise<TypedResponse<CompleteAuthenticationResponse | ApiErrorResponse>> => {
    try {
      const input: CompleteAuthenticationBody = CompleteAuthenticationSchema.parse(await honoCtx.req.json());

      const {userHandle, ...response} = input.credential.response;
      const result = await authenticator.complete({
        challengeId: input.challengeId,
        credential: {
          ...input.credential,
          response: {
            ...response,
            ...(userHandle !== undefined && {userHandle}),
          },
        },
      });

      // Set session cookie
      setSessionCookie(honoCtx, result.session.id, maxAgeSec);

      return honoCtx.json<CompleteAuthenticationResponse>({
        account: {
          id: result.account.id,
          username: result.account.username,
          starknetAddress: result.account.getStarknetAddress() ?? null,
          status: result.account.getStatus(),
        },
      });
    } catch (error) {
      return handleDomainError(honoCtx, error, log);
    }
  });

  // ---------------------------------------------------------------------------
  // Session
  // ---------------------------------------------------------------------------

  app.get('/session', async (honoCtx): Promise<TypedResponse<SessionResponse | ApiErrorResponse>> => {
    try {
      const sessionId = getSessionId(honoCtx);
      if (!sessionId) {
        return honoCtx.json({authenticated: false});
      }

      const result = await sessionValidator.validate({sessionId});

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
        clearSessionCookie(honoCtx);
        return honoCtx.json({authenticated: false});
      }
      return handleDomainError(honoCtx, error, log);
    }
  });

  app.post('/logout', async (honoCtx): Promise<TypedResponse<LogoutResponse>> => {
    try {
      const sessionId = getSessionId(honoCtx);
      if (sessionId) {
        await sessionInvalidator.invalidate({sessionId});
      }

      clearSessionCookie(honoCtx);
      return honoCtx.json<LogoutResponse>({success: true});
    } catch (err) {
      log.error({err}, 'Logout error');
      clearSessionCookie(honoCtx);
      return honoCtx.json<LogoutResponse>({success: true});
    }
  });

  return app;
}


