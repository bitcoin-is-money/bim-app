import {
  BeginRegistration,
  type WebAuthnConfig,
} from '@bim/domain/auth';
import type {ChallengeRepository} from '@bim/domain/ports';
import {createLogger} from '@bim/lib/logger';
import {beforeEach, describe, expect, it} from 'vitest';
import {createChallengeRepoMock} from '../../helper';

const logger = createLogger('silent');
const webauthnConfig: WebAuthnConfig = {
  rpId: 'localhost',
  rpName: 'BIM Test',
  origin: 'http://localhost:4200',
};

describe('BeginRegistration', () => {
  let challengeRepo: ChallengeRepository;
  let service: BeginRegistration;

  beforeEach(() => {
    challengeRepo = createChallengeRepoMock();
    service = new BeginRegistration({
      challengeRepository: challengeRepo,
      webAuthnConfig: webauthnConfig,
      logger,
    });
  });

  it('creates a registration challenge and returns WebAuthn options', async () => {
    const result = await service.execute({username: 'testUser'});

    expect(result.options.userName).toBe('testUser');
    expect(result.options.rpId).toBe(webauthnConfig.rpId);
    expect(result.options.rpName).toBe(webauthnConfig.rpName);
    expect(result.options.userId).toBe(result.accountId);
    expect(result.challengeId).toBeDefined();
    expect(challengeRepo.save).toHaveBeenCalledOnce();
  });
});
