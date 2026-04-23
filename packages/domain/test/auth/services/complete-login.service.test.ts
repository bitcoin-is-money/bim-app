import {AccountId, AccountNotFoundError} from '@bim/domain/account';
import type {
  ChallengeConsumer} from '@bim/domain/auth';
import {
  AuthenticationFailedError,
  Challenge,
  ChallengeId,
  CompleteLogin,
  InvalidChallengeError,
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
  createAccount,
  createAccountRepoMock,
  createSessionRepoMock,
  createTransactionManagerMock,
  createWebAuthnGatewayMock,
} from '../../helper';

const logger = createLogger('silent');
const sessionConfig = SessionConfig.create({durationMs: SessionConfig.DEFAULT_DURATION_MS});

const ACCOUNT_ID = '550e8400-e29b-41d4-a716-446655440000';
const CHALLENGE_ID = '660e8400-e29b-41d4-a716-446655440001';
// Base64URL-encoded 16 bytes that decode to ACCOUNT_ID's UUID bytes
const USER_HANDLE = 'VQ6EAOKbQdSnFkZlVEQAAA';

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

describe('CompleteLogin', () => {
  let accountRepo: AccountRepository;
  let sessionRepo: SessionRepository;
  let txManager: TransactionManager;
  let webauthnGateway: WebAuthnGateway;
  let challengeConsumer: ChallengeConsumer;
  let service: CompleteLogin;

  beforeEach(() => {
    accountRepo = createAccountRepoMock();
    sessionRepo = createSessionRepoMock();
    txManager = createTransactionManagerMock();
    webauthnGateway = createWebAuthnGatewayMock();
    challengeConsumer = {
      consume: vi.fn(),
    } as unknown as ChallengeConsumer;

    service = new CompleteLogin({
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
    vi.mocked(challengeConsumer.consume).mockResolvedValue(makeAuthenticationChallenge());
    vi.mocked(accountRepo.findById).mockResolvedValue(createAccount('deployed', AccountId.of(ACCOUNT_ID)));
    vi.mocked(webauthnGateway.verifyAuthentication).mockResolvedValue({
      verified: true,
      newSignCount: 1,
    });
  }

  it('verifies signature and creates session on happy path', async () => {
    happyPathSetup();

    const result = await service.execute({
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
    vi.mocked(challengeConsumer.consume).mockResolvedValue(makeRegistrationChallenge());

    await expect(
      service.execute({
        challengeId: CHALLENGE_ID,
        credential: AUTHENTICATION_CREDENTIAL,
      }),
    ).rejects.toThrow(InvalidChallengeError);
  });

  it('throws AuthenticationFailedError when userHandle is missing', async () => {
    vi.mocked(challengeConsumer.consume).mockResolvedValue(makeAuthenticationChallenge());

    await expect(
      service.execute({
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
    vi.mocked(challengeConsumer.consume).mockResolvedValue(makeAuthenticationChallenge());
    vi.mocked(accountRepo.findById).mockResolvedValue(undefined);

    await expect(
      service.execute({
        challengeId: CHALLENGE_ID,
        credential: AUTHENTICATION_CREDENTIAL,
      }),
    ).rejects.toThrow(AccountNotFoundError);
  });

  it('throws AuthenticationFailedError when WebAuthn verification fails', async () => {
    vi.mocked(challengeConsumer.consume).mockResolvedValue(makeAuthenticationChallenge());
    vi.mocked(accountRepo.findById).mockResolvedValue(createAccount('deployed', AccountId.of(ACCOUNT_ID)));
    vi.mocked(webauthnGateway.verifyAuthentication).mockResolvedValue({
      verified: false,
      newSignCount: 0,
    });

    await expect(
      service.execute({
        challengeId: CHALLENGE_ID,
        credential: AUTHENTICATION_CREDENTIAL,
      }),
    ).rejects.toThrow(AuthenticationFailedError);
  });

  it('updates sign count when verification reports a higher counter', async () => {
    const account = createAccount('deployed', AccountId.of(ACCOUNT_ID));
    vi.mocked(challengeConsumer.consume).mockResolvedValue(makeAuthenticationChallenge());
    vi.mocked(accountRepo.findById).mockResolvedValue(account);
    vi.mocked(webauthnGateway.verifyAuthentication).mockResolvedValue({
      verified: true,
      newSignCount: 42,
    });

    await service.execute({
      challengeId: CHALLENGE_ID,
      credential: AUTHENTICATION_CREDENTIAL,
    });

    expect(account.getSignCount()).toBe(42);
  });
});
