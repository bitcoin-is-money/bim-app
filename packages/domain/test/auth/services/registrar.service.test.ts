import {AccountAlreadyExistsError} from '@bim/domain/account';
import type {
  ChallengeConsumer} from '@bim/domain/auth';
import {
  Challenge,
  ChallengeId,
  InvalidChallengeError,
  Registrar,
  RegistrationFailedError,
  SessionConfig,
  type WebAuthnConfig,
} from '@bim/domain/auth';
import type {
  AccountRepository,
  ChallengeRepository,
  SessionRepository,
  TransactionManager,
  WebAuthnGateway,
} from '@bim/domain/ports';
import {createLogger} from '@bim/lib/logger';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {
  createAccountRepoMock,
  createChallengeRepoMock,
  createSessionRepoMock,
  createTransactionManagerMock,
  createWebAuthnGatewayMock,
} from '../../helper';

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

describe('Registrar', () => {
  let accountRepo: AccountRepository;
  let sessionRepo: SessionRepository;
  let challengeRepo: ChallengeRepository;
  let txManager: TransactionManager;
  let webauthnGateway: WebAuthnGateway;
  let challengeConsumer: ChallengeConsumer;
  let service: Registrar;

  beforeEach(() => {
    accountRepo = createAccountRepoMock();
    sessionRepo = createSessionRepoMock();
    challengeRepo = createChallengeRepoMock();
    txManager = createTransactionManagerMock();
    webauthnGateway = createWebAuthnGatewayMock();
    challengeConsumer = {
      consume: vi.fn(),
    } as unknown as ChallengeConsumer;

    service = new Registrar({
      accountRepository: accountRepo,
      sessionRepository: sessionRepo,
      challengeRepository: challengeRepo,
      transactionManager: txManager,
      webAuthnGateway: webauthnGateway,
      challengeConsumer,
      sessionConfig,
      webAuthnConfig: webauthnConfig,
      logger,
    });
  });

  // ===========================================================================
  describe('begin', () => {
    it('creates a registration challenge and returns WebAuthn options', async () => {
      const result = await service.begin({username: USERNAME});

      expect(result.options.userName).toBe(USERNAME);
      expect(result.options.rpId).toBe(webauthnConfig.rpId);
      expect(result.options.rpName).toBe(webauthnConfig.rpName);
      expect(result.options.userId).toBe(result.accountId);
      expect(result.challengeId).toBeDefined();
      expect(challengeRepo.save).toHaveBeenCalledOnce();
    });
  });

  // ===========================================================================
  describe('complete', () => {
    function happyPathSetup(): void {
      vi.mocked(accountRepo.existsByUsername).mockResolvedValue(false);
      vi.mocked(challengeConsumer.consume).mockResolvedValue(makeRegistrationChallenge());
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

      const result = await service.complete({
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
        service.complete({
          challengeId: CHALLENGE_ID,
          accountId: ACCOUNT_ID,
          username: USERNAME,
          credential: REGISTRATION_CREDENTIAL,
        }),
      ).rejects.toThrow(AccountAlreadyExistsError);
    });

    it('propagates errors from ChallengeConsumer', async () => {
      vi.mocked(accountRepo.existsByUsername).mockResolvedValue(false);
      const boom = new Error('boom from consumer');
      vi.mocked(challengeConsumer.consume).mockRejectedValue(boom);

      await expect(
        service.complete({
          challengeId: CHALLENGE_ID,
          accountId: ACCOUNT_ID,
          username: USERNAME,
          credential: REGISTRATION_CREDENTIAL,
        }),
      ).rejects.toThrow(boom);
    });

    it('throws InvalidChallengeError when challenge purpose is not registration', async () => {
      vi.mocked(accountRepo.existsByUsername).mockResolvedValue(false);
      vi.mocked(challengeConsumer.consume).mockResolvedValue(makeAuthenticationChallenge());

      await expect(
        service.complete({
          challengeId: CHALLENGE_ID,
          accountId: ACCOUNT_ID,
          username: USERNAME,
          credential: REGISTRATION_CREDENTIAL,
        }),
      ).rejects.toThrow(InvalidChallengeError);
    });

    it('throws InvalidChallengeError when accountId does not match challenge', async () => {
      vi.mocked(accountRepo.existsByUsername).mockResolvedValue(false);
      vi.mocked(challengeConsumer.consume).mockResolvedValue(makeRegistrationChallenge());

      await expect(
        service.complete({
          challengeId: CHALLENGE_ID,
          accountId: '770e8400-e29b-41d4-a716-446655440002', // different
          username: USERNAME,
          credential: REGISTRATION_CREDENTIAL,
        }),
      ).rejects.toThrow(InvalidChallengeError);
    });

    it('throws RegistrationFailedError when WebAuthn verification fails', async () => {
      vi.mocked(accountRepo.existsByUsername).mockResolvedValue(false);
      vi.mocked(challengeConsumer.consume).mockResolvedValue(makeRegistrationChallenge());
      vi.mocked(webauthnGateway.verifyRegistration).mockResolvedValue({
        verified: false,
        encodedCredentialId: '',
        starknetPublicKeyX: '',
        encodedCredentialPublicKey: '',
        signCount: 0,
      });

      await expect(
        service.complete({
          challengeId: CHALLENGE_ID,
          accountId: ACCOUNT_ID,
          username: USERNAME,
          credential: REGISTRATION_CREDENTIAL,
        }),
      ).rejects.toThrow(RegistrationFailedError);
    });
  });
});
