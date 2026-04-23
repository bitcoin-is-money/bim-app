import {
  InvalidateSession,
  InvalidSessionIdError,
  SessionId,
} from '@bim/domain/auth';
import type {SessionRepository} from '@bim/domain/ports';
import {beforeEach, describe, expect, it} from 'vitest';
import {createSessionRepoMock} from '../../helper';

describe('InvalidateSession', () => {
  const sessionId = SessionId.of('660e8400-e29b-41d4-a716-446655440001');

  let mockSessionRepo: SessionRepository;
  let service: InvalidateSession;

  beforeEach(() => {
    mockSessionRepo = createSessionRepoMock();
    service = new InvalidateSession({sessionRepository: mockSessionRepo});
  });

  it('deletes the session identified by sessionId', async () => {
    await service.execute({sessionId});

    expect(mockSessionRepo.delete).toHaveBeenCalledWith(sessionId);
  });

  it('throws InvalidSessionIdError for invalid session ID format', async () => {
    await expect(
      service.execute({sessionId: 'invalid-uuid'}),
    ).rejects.toThrow(InvalidSessionIdError);
  });

  it('does not throw when the session does not exist (delete is idempotent)', async () => {
    await expect(service.execute({sessionId})).resolves.not.toThrow();
    expect(mockSessionRepo.delete).toHaveBeenCalledWith(sessionId);
  });
});
