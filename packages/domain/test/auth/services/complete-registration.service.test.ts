import {AccountAlreadyExistsError} from '@bim/domain/account';
import type {
  ChallengeConsumer} from '@bim/domain/auth';
import {
  Challenge,
  ChallengeId,
  CompleteRegistration,
  InvalidChallengeError,
  RegistrationFailedError,
  SessionConfig,
} from '@bim/domain/auth';
import type {
  AccountRepository,
  SessionRepository,
  TransactionManager,
  WebAuthnGateway,
} from '@bim/domain/ports';
import {createLogger} from '@bim/lib/logger';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {
  createAccountRepoMock,
  createSessionRepoMock,
  createTransactionManagerMock,
  createWebAuthnGatewayMock,
} from '../../helper';

const logger = createLogger('silent');
const sessionConfig = SessionConfig.create({durationMs: SessionConfig.DEFAULT_DURATION_MS});

const ACCOUNT_ID = '550e8400-e29b-41d4-a716-446655440000';
const CHALLENGE_ID = '660e8400-e29b-41d4-a716-446655440001';
const USERNAME = 'testUser';

function makeRegistrationChallenge(): Challenge {
  return new Challenge(
    ChallengeId.of(CHALLENGE_ID),
    'challenge-string',
    'registration',
    'localhost',
    'http://localhost:4200',
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
    'localhost',
    'http://localhost:4200',
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

describe('CompleteRegistration', () => {
  let accountRepo: AccountRepository;
  let sessionRepo: SessionRepository;
  let txManager: TransactionManager;
  let webauthnGateway: WebAuthnGateway;
  let challengeConsumer: ChallengeConsumer;
  let service: CompleteRegistration;

  beforeEach(() => {
    accountRepo = createAccountRepoMock();
    sessionRepo = createSessionRepoMock();
    txManager = createTransactionManagerMock();
    webauthnGateway = createWebAuthnGatewayMock();
    challengeConsumer = {
      consume: vi.fn(),
    } as unknown as ChallengeConsumer;

    service = new CompleteRegistration({
      accountRepository: accountRepo,
      sessionRepository: sessionRepo,
      transactionManager: txManager,
      webAuthnGateway: webauthnGateway,
      challengeConsumer,
      sessionConfig,
      logger,
    });
  });

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

    const result = await service.execute({
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
      service.execute({
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
      service.execute({
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
      service.execute({
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
      service.execute({
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
      service.execute({
        challengeId: CHALLENGE_ID,
        accountId: ACCOUNT_ID,
        username: USERNAME,
        credential: REGISTRATION_CREDENTIAL,
      }),
    ).rejects.toThrow(RegistrationFailedError);
  });
});
