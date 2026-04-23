import {
  InvalidSessionIdError,
  SessionId,
  SessionInvalidator,
} from '@bim/domain/auth';
import type {SessionRepository} from '@bim/domain/ports';
import {beforeEach, describe, expect, it} from 'vitest';
import {createSessionRepoMock} from '../../helper';

describe('SessionInvalidator', () => {
  const sessionId = SessionId.of('660e8400-e29b-41d4-a716-446655440001');

  let mockSessionRepo: SessionRepository;
  let service: SessionInvalidator;

  beforeEach(() => {
    mockSessionRepo = createSessionRepoMock();
    service = new SessionInvalidator({sessionRepository: mockSessionRepo});
  });

  it('deletes the session identified by sessionId', async () => {
    await service.invalidate({sessionId});

    expect(mockSessionRepo.delete).toHaveBeenCalledWith(sessionId);
  });

  it('throws InvalidSessionIdError for invalid session ID format', async () => {
    await expect(
      service.invalidate({sessionId: 'invalid-uuid'}),
    ).rejects.toThrow(InvalidSessionIdError);
  });

  it('does not throw when the session does not exist (delete is idempotent)', async () => {
    await expect(service.invalidate({sessionId})).resolves.not.toThrow();
    expect(mockSessionRepo.delete).toHaveBeenCalledWith(sessionId);
  });
});
