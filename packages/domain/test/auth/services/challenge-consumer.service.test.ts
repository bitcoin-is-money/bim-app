import {
  Challenge,
  ChallengeAlreadyUsedError,
  ChallengeConsumer,
  ChallengeExpiredError,
  ChallengeId,
  ChallengeNotFoundError,
} from '@bim/domain/auth';
import type {ChallengeRepository} from '@bim/domain/ports';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {createChallengeRepoMock} from '../../helper';

const CHALLENGE_ID = '660e8400-e29b-41d4-a716-446655440001';

function makeValidChallenge(): Challenge {
  return new Challenge(
    ChallengeId.of(CHALLENGE_ID),
    'challenge-string',
    'registration',
    'localhost',
    'http://localhost:4200',
    '550e8400-e29b-41d4-a716-446655440000',
    new Date(Date.now() + 60_000),
    new Date(),
    false,
  );
}

function makeExpiredChallenge(): Challenge {
  return new Challenge(
    ChallengeId.of(CHALLENGE_ID),
    'challenge-string',
    'registration',
    'localhost',
    'http://localhost:4200',
    '550e8400-e29b-41d4-a716-446655440000',
    new Date(Date.now() - 1000),
    new Date(Date.now() - 60_000),
    false,
  );
}

describe('ChallengeConsumer', () => {
  const challengeId = ChallengeId.of(CHALLENGE_ID);

  let mockChallengeRepo: ChallengeRepository;
  let service: ChallengeConsumer;

  beforeEach(() => {
    mockChallengeRepo = createChallengeRepoMock();
    service = new ChallengeConsumer({challengeRepository: mockChallengeRepo});
  });

  it('returns the consumed challenge on happy path', async () => {
    const challenge = makeValidChallenge();
    vi.mocked(mockChallengeRepo.consumeById).mockResolvedValue(challenge);

    const result = await service.consume(challengeId);

    expect(result).toBe(challenge);
  });

  it('throws ChallengeNotFoundError when the challenge does not exist', async () => {
    vi.mocked(mockChallengeRepo.consumeById).mockResolvedValue(undefined);
    vi.mocked(mockChallengeRepo.findById).mockResolvedValue(undefined);

    await expect(service.consume(challengeId)).rejects.toThrow(ChallengeNotFoundError);
  });

  it('throws ChallengeExpiredError when the stale challenge is expired', async () => {
    vi.mocked(mockChallengeRepo.consumeById).mockResolvedValue(undefined);
    vi.mocked(mockChallengeRepo.findById).mockResolvedValue(makeExpiredChallenge());

    await expect(service.consume(challengeId)).rejects.toThrow(ChallengeExpiredError);
  });

  it('throws ChallengeAlreadyUsedError when a concurrent request consumed it first', async () => {
    // consumeById returned undefined but the challenge is still valid when we fetch it
    // -> another request consumed it between our UPDATE and this SELECT
    vi.mocked(mockChallengeRepo.consumeById).mockResolvedValue(undefined);
    vi.mocked(mockChallengeRepo.findById).mockResolvedValue(makeValidChallenge());

    await expect(service.consume(challengeId)).rejects.toThrow(ChallengeAlreadyUsedError);
  });
});
