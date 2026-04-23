import {Account, AccountId, CredentialId} from '@bim/domain/account';
import {
  InvalidSessionIdError,
  Session,
  SessionConfig,
  SessionExpiredError,
  SessionId,
  SessionNotFoundError,
  SessionValidator,
} from '@bim/domain/auth';
import type {AccountRepository, SessionRepository} from '@bim/domain/ports';
import {createLogger} from '@bim/lib/logger';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {createAccountRepoMock, createSessionRepoMock} from '../../helper';

const logger = createLogger('silent');
const DURATION_MS = SessionConfig.DEFAULT_DURATION_MS;
const sessionConfig = SessionConfig.create({durationMs: DURATION_MS});

describe('SessionValidator', () => {
  const accountId = AccountId.of('550e8400-e29b-41d4-a716-446655440000');
  const sessionId = SessionId.of('660e8400-e29b-41d4-a716-446655440001');

  let mockSessionRepo: SessionRepository;
  let mockAccountRepo: AccountRepository;
  let service: SessionValidator;

  function makeAccount(): Account {
    return Account.create({
      id: accountId,
      username: 'testUser',
      credentialId: CredentialId.of('credential123'),
      publicKey: '0x' + '1'.repeat(64),
    });
  }

  function makeSession(expiresAt?: Date): Session {
    return new Session(
      sessionId,
      accountId,
      expiresAt ?? new Date(Date.now() + DURATION_MS),
      new Date(),
    );
  }

  beforeEach(() => {
    mockSessionRepo = createSessionRepoMock();
    mockAccountRepo = createAccountRepoMock();
    service = new SessionValidator({
      sessionRepository: mockSessionRepo,
      accountRepository: mockAccountRepo,
      sessionConfig,
      logger,
    });
  });

  it('returns account and renewed session for valid session', async () => {
    const account = makeAccount();
    const session = makeSession();
    vi.mocked(mockSessionRepo.findById).mockResolvedValue(session);
    vi.mocked(mockAccountRepo.findById).mockResolvedValue(account);

    const result = await service.validate({sessionId});

    expect(result.account.id).toBe(accountId);
    expect(result.session.id).toBe(sessionId);
  });

  it('renews session expiry and saves on successful validation', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));

    const account = makeAccount();
    const session = makeSession();
    vi.mocked(mockSessionRepo.findById).mockResolvedValue(session);
    vi.mocked(mockAccountRepo.findById).mockResolvedValue(account);

    // Advance 5 minutes into the session
    vi.advanceTimersByTime(5 * 60 * 1000);

    const result = await service.validate({sessionId});

    // Renewed session should have expiresAt = now + DURATION_MS (not original expiry)
    expect(result.session.expiresAt.getTime()).toBe(Date.now() + DURATION_MS);
    // Should save the renewed session to DB
    expect(mockSessionRepo.save).toHaveBeenCalledWith(result.session);

    vi.useRealTimers();
  });

  it('throws InvalidSessionIdError for invalid session ID format', async () => {
    await expect(
      service.validate({sessionId: 'invalid-uuid'}),
    ).rejects.toThrow(InvalidSessionIdError);
  });

  it('throws SessionNotFoundError if session not found', async () => {
    vi.mocked(mockSessionRepo.findById).mockResolvedValue(undefined);

    await expect(
      service.validate({sessionId}),
    ).rejects.toThrow(SessionNotFoundError);
  });

  it('throws SessionExpiredError if session is expired', async () => {
    const expiredSession = makeSession(new Date(Date.now() - 1000));
    vi.mocked(mockSessionRepo.findById).mockResolvedValue(expiredSession);

    await expect(
      service.validate({sessionId}),
    ).rejects.toThrow(SessionExpiredError);
  });

  it('throws SessionNotFoundError and deletes orphaned session if account not found', async () => {
    const session = makeSession();
    vi.mocked(mockSessionRepo.findById).mockResolvedValue(session);
    vi.mocked(mockAccountRepo.findById).mockResolvedValue(undefined);

    await expect(
      service.validate({sessionId}),
    ).rejects.toThrow(SessionNotFoundError);

    expect(mockSessionRepo.delete).toHaveBeenCalledWith(sessionId);
  });
});
