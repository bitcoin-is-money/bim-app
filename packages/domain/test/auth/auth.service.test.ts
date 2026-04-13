import {AccountAlreadyExistsError, AccountId, AccountNotFoundError} from '@bim/domain/account';
import {
  AuthenticationFailedError,
  AuthService,
  Challenge,
  ChallengeAlreadyUsedError,
  ChallengeExpiredError,
  ChallengeId,
  ChallengeNotFoundError,
  InvalidChallengeError,
  RegistrationFailedError,
  SessionConfig,
  type WebAuthnConfig,
} from '@bim/domain/auth';
import type {AccountRepository, ChallengeRepository, SessionRepository, TransactionManager, WebAuthnGateway} from '@bim/domain/ports';
import {createLogger} from '@bim/lib/logger';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {
  createAccount,
  createAccountRepoMock,
  createChallengeRepoMock,
  createSessionRepoMock,
  createTransactionManagerMock,
  createWebAuthnGatewayMock,
} from '../helper';

const logger = createLogger('silent');
const sessionConfig = SessionConfig.create({durationMs: SessionConfig.DEFAULT_DURATION_MS});
const webauthnConfig: WebAuthnConfig = {
  rpId: 'localhost',
  rpName: 'BIM Test',
  origin: 'http://localhost:4200',
};

const ACCOUNT_ID = '550e8400-e29b-41d4-a716-446655440000';
const CHALLENGE_ID = '660e8400-e29b-41d4-a716-446655440001';
const USERNAME = 'testUser';
// Base64URL-encoded 16 bytes that decode to ACCOUNT_ID's UUID bytes
const USER_HANDLE = 'VQ6EAOKbQdSnFkZlVEQAAA';

function makeRegistrationChallenge(): Challenge {
  return new Challenge(
    ChallengeId.of(CHALLENGE_ID),
    'challenge-string',
    'registration',
    webauthnConfig.rpId,
    webauthnConfig.origin,
    ACCOUNT_ID,
    new Date(Date.now() + 60_000),
    new Date(),
    false,
  );
}

function makeAuthenticationChallenge(): Challenge {
  return new Challenge(
    ChallengeId.of(CHALLENGE_ID),
    'challenge-string',
    'authentication',
    webauthnConfig.rpId,
    webauthnConfig.origin,
    undefined,
    new Date(Date.now() + 60_000),
    new Date(),
    false,
  );
}

const REGISTRATION_CREDENTIAL = {
  id: 'cred-id',
  rawId: 'cred-id',
  response: {clientDataJSON: 'cdj', attestationObject: 'ao'},
  type: 'public-key' as const,
};

const AUTHENTICATION_CREDENTIAL = {
  id: 'cred-id',
  rawId: 'cred-id',
  response: {
    clientDataJSON: 'cdj',
    authenticatorData: 'ad',
    signature: 'sig',
    userHandle: USER_HANDLE,
  },
  type: 'public-key' as const,
};

describe('AuthService', () => {
  let accountRepo: AccountRepository;
  let challengeRepo: ChallengeRepository;
  let sessionRepo: SessionRepository;
  let txManager: TransactionManager;
  let webauthnGateway: WebAuthnGateway;
  let service: AuthService;

  beforeEach(() => {
    accountRepo = createAccountRepoMock();
    challengeRepo = createChallengeRepoMock();
    sessionRepo = createSessionRepoMock();
    txManager = createTransactionManagerMock();
    webauthnGateway = createWebAuthnGatewayMock();
    service = new AuthService(
      {
        accountRepository: accountRepo,
        challengeRepository: challengeRepo,
        sessionRepository: sessionRepo,
        transactionManager: txManager,
        webAuthnGateway: webauthnGateway,
        sessionConfig,
        logger,
      },
      webauthnConfig,
    );
  });

  // ===========================================================================
  describe('beginRegistration', () => {
    it('creates a registration challenge and returns WebAuthn options', async () => {
      const result = await service.beginRegistration({username: USERNAME});

      expect(result.options.userName).toBe(USERNAME);
      expect(result.options.rpId).toBe(webauthnConfig.rpId);
      expect(result.options.rpName).toBe(webauthnConfig.rpName);
      expect(result.options.userId).toBe(result.accountId);
      expect(result.challengeId).toBeDefined();
      expect(challengeRepo.save).toHaveBeenCalledOnce();
    });
  });

  // ===========================================================================
  describe('completeRegistration', () => {
    function happyPathSetup(): void {
      vi.mocked(accountRepo.existsByUsername).mockResolvedValue(false);
      vi.mocked(challengeRepo.consumeById).mockResolvedValue(makeRegistrationChallenge());
      vi.mocked(webauthnGateway.verifyRegistration).mockResolvedValue({
        verified: true,
        encodedCredentialId: 'encoded-cred-id',
        starknetPublicKeyX: '0x' + '1'.repeat(64),
        encodedCredentialPublicKey: 'encoded-pk',
        signCount: 0,
      });
    }

    it('creates account + session on happy path', async () => {
      happyPathSetup();

      const result = await service.completeRegistration({
        challengeId: CHALLENGE_ID,
        accountId: ACCOUNT_ID,
        username: USERNAME,
        credential: REGISTRATION_CREDENTIAL,
      });

      expect(result.account.username).toBe(USERNAME);
      expect(result.account.id).toBe(ACCOUNT_ID);
      expect(result.session.accountId).toBe(ACCOUNT_ID);
      expect(accountRepo.save).toHaveBeenCalledWith(result.account);
      expect(sessionRepo.save).toHaveBeenCalledWith(result.session);
      expect(sessionRepo.deleteByAccountId).toHaveBeenCalledWith(result.account.id);
      expect(txManager.execute).toHaveBeenCalledOnce();
    });

    it('throws AccountAlreadyExistsError when username is taken', async () => {
      vi.mocked(accountRepo.existsByUsername).mockResolvedValue(true);

      await expect(
        service.completeRegistration({
          challengeId: CHALLENGE_ID,
          accountId: ACCOUNT_ID,
          username: USERNAME,
          credential: REGISTRATION_CREDENTIAL,
        }),
      ).rejects.toThrow(AccountAlreadyExistsError);
    });

    it('throws ChallengeNotFoundError when consume returns undefined and no stale challenge', async () => {
      vi.mocked(accountRepo.existsByUsername).mockResolvedValue(false);
      vi.mocked(challengeRepo.consumeById).mockResolvedValue(undefined);
      vi.mocked(challengeRepo.findById).mockResolvedValue(undefined);

      await expect(
        service.completeRegistration({
          challengeId: CHALLENGE_ID,
          accountId: ACCOUNT_ID,
          username: USERNAME,
          credential: REGISTRATION_CREDENTIAL,
        }),
      ).rejects.toThrow(ChallengeNotFoundError);
    });

    it('throws ChallengeExpiredError when stale challenge is expired', async () => {
      const expired = new Challenge(
        ChallengeId.of(CHALLENGE_ID), 'c', 'registration',
        webauthnConfig.rpId, webauthnConfig.origin, ACCOUNT_ID,
        new Date(Date.now() - 1000), new Date(), false,
      );
      vi.mocked(accountRepo.existsByUsername).mockResolvedValue(false);
      vi.mocked(challengeRepo.consumeById).mockResolvedValue(undefined);
      vi.mocked(challengeRepo.findById).mockResolvedValue(expired);

      await expect(
        service.completeRegistration({
          challengeId: CHALLENGE_ID,
          accountId: ACCOUNT_ID,
          username: USERNAME,
          credential: REGISTRATION_CREDENTIAL,
        }),
      ).rejects.toThrow(ChallengeExpiredError);
    });

    it('throws ChallengeAlreadyUsedError when consume races with another request', async () => {
      vi.mocked(accountRepo.existsByUsername).mockResolvedValue(false);
      vi.mocked(challengeRepo.consumeById).mockResolvedValue(undefined);
      // findById returns a still-valid challenge — meaning it was consumed between our UPDATE and SELECT
      vi.mocked(challengeRepo.findById).mockResolvedValue(makeRegistrationChallenge());

      await expect(
        service.completeRegistration({
          challengeId: CHALLENGE_ID,
          accountId: ACCOUNT_ID,
          username: USERNAME,
          credential: REGISTRATION_CREDENTIAL,
        }),
      ).rejects.toThrow(ChallengeAlreadyUsedError);
    });

    it('throws InvalidChallengeError when challenge purpose is not registration', async () => {
      vi.mocked(accountRepo.existsByUsername).mockResolvedValue(false);
      vi.mocked(challengeRepo.consumeById).mockResolvedValue(makeAuthenticationChallenge());

      await expect(
        service.completeRegistration({
          challengeId: CHALLENGE_ID,
          accountId: ACCOUNT_ID,
          username: USERNAME,
          credential: REGISTRATION_CREDENTIAL,
        }),
      ).rejects.toThrow(InvalidChallengeError);
    });

    it('throws InvalidChallengeError when accountId does not match challenge', async () => {
      vi.mocked(accountRepo.existsByUsername).mockResolvedValue(false);
      vi.mocked(challengeRepo.consumeById).mockResolvedValue(makeRegistrationChallenge());

      await expect(
        service.completeRegistration({
          challengeId: CHALLENGE_ID,
          accountId: '770e8400-e29b-41d4-a716-446655440002', // different
          username: USERNAME,
          credential: REGISTRATION_CREDENTIAL,
        }),
      ).rejects.toThrow(InvalidChallengeError);
    });

    it('throws RegistrationFailedError when WebAuthn verification fails', async () => {
      vi.mocked(accountRepo.existsByUsername).mockResolvedValue(false);
      vi.mocked(challengeRepo.consumeById).mockResolvedValue(makeRegistrationChallenge());
      vi.mocked(webauthnGateway.verifyRegistration).mockResolvedValue({
        verified: false,
        encodedCredentialId: '',
        starknetPublicKeyX: '',
        encodedCredentialPublicKey: '',
        signCount: 0,
      });

      await expect(
        service.completeRegistration({
          challengeId: CHALLENGE_ID,
          accountId: ACCOUNT_ID,
          username: USERNAME,
          credential: REGISTRATION_CREDENTIAL,
        }),
      ).rejects.toThrow(RegistrationFailedError);
    });
  });

  // ===========================================================================
  describe('beginAuthentication', () => {
    it('creates an authentication challenge with empty allowCredentials (usernameless flow)', async () => {
      const result = await service.beginAuthentication();

      expect(result.options.allowCredentials).toEqual([]);
      expect(result.options.userVerification).toBe('required');
      expect(result.options.rpId).toBe(webauthnConfig.rpId);
      expect(challengeRepo.save).toHaveBeenCalledOnce();
    });
  });

  // ===========================================================================
  describe('completeAuthentication', () => {
    function happyPathSetup(): void {
      vi.mocked(challengeRepo.consumeById).mockResolvedValue(makeAuthenticationChallenge());
      vi.mocked(accountRepo.findById).mockResolvedValue(createAccount('deployed', AccountId.of(ACCOUNT_ID)));
      vi.mocked(webauthnGateway.verifyAuthentication).mockResolvedValue({
        verified: true,
        newSignCount: 1,
      });
    }

    it('verifies signature and creates session on happy path', async () => {
      happyPathSetup();

      const result = await service.completeAuthentication({
        challengeId: CHALLENGE_ID,
        credential: AUTHENTICATION_CREDENTIAL,
      });

      expect(result.account.id).toBe(ACCOUNT_ID);
      expect(result.session.accountId).toBe(ACCOUNT_ID);
      expect(sessionRepo.save).toHaveBeenCalledWith(result.session);
      expect(sessionRepo.deleteByAccountId).toHaveBeenCalledWith(ACCOUNT_ID);
      expect(accountRepo.save).toHaveBeenCalledWith(result.account);
    });

    it('throws InvalidChallengeError when challenge purpose is not authentication', async () => {
      vi.mocked(challengeRepo.consumeById).mockResolvedValue(makeRegistrationChallenge());

      await expect(
        service.completeAuthentication({
          challengeId: CHALLENGE_ID,
          credential: AUTHENTICATION_CREDENTIAL,
        }),
      ).rejects.toThrow(InvalidChallengeError);
    });

    it('throws AuthenticationFailedError when userHandle is missing', async () => {
      vi.mocked(challengeRepo.consumeById).mockResolvedValue(makeAuthenticationChallenge());

      await expect(
        service.completeAuthentication({
          challengeId: CHALLENGE_ID,
          credential: {
            ...AUTHENTICATION_CREDENTIAL,
            response: {
              clientDataJSON: AUTHENTICATION_CREDENTIAL.response.clientDataJSON,
              authenticatorData: AUTHENTICATION_CREDENTIAL.response.authenticatorData,
              signature: AUTHENTICATION_CREDENTIAL.response.signature,
            },
          },
        }),
      ).rejects.toThrow(AuthenticationFailedError);
    });

    it('throws AccountNotFoundError when account does not exist', async () => {
      vi.mocked(challengeRepo.consumeById).mockResolvedValue(makeAuthenticationChallenge());
      vi.mocked(accountRepo.findById).mockResolvedValue(undefined);

      await expect(
        service.completeAuthentication({
          challengeId: CHALLENGE_ID,
          credential: AUTHENTICATION_CREDENTIAL,
        }),
      ).rejects.toThrow(AccountNotFoundError);
    });

    it('throws AuthenticationFailedError when WebAuthn verification fails', async () => {
      vi.mocked(challengeRepo.consumeById).mockResolvedValue(makeAuthenticationChallenge());
      vi.mocked(accountRepo.findById).mockResolvedValue(createAccount('deployed', AccountId.of(ACCOUNT_ID)));
      vi.mocked(webauthnGateway.verifyAuthentication).mockResolvedValue({
        verified: false,
        newSignCount: 0,
      });

      await expect(
        service.completeAuthentication({
          challengeId: CHALLENGE_ID,
          credential: AUTHENTICATION_CREDENTIAL,
        }),
      ).rejects.toThrow(AuthenticationFailedError);
    });

    it('updates sign count when verification reports a higher counter', async () => {
      const account = createAccount('deployed', AccountId.of(ACCOUNT_ID));
      vi.mocked(challengeRepo.consumeById).mockResolvedValue(makeAuthenticationChallenge());
      vi.mocked(accountRepo.findById).mockResolvedValue(account);
      vi.mocked(webauthnGateway.verifyAuthentication).mockResolvedValue({
        verified: true,
        newSignCount: 42,
      });

      await service.completeAuthentication({
        challengeId: CHALLENGE_ID,
        credential: AUTHENTICATION_CREDENTIAL,
      });

      expect(account.getSignCount()).toBe(42);
    });
  });
});
