import {
  BeginLogin,
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

describe('BeginLogin', () => {
  let challengeRepo: ChallengeRepository;
  let service: BeginLogin;

  beforeEach(() => {
    challengeRepo = createChallengeRepoMock();
    service = new BeginLogin({
      challengeRepository: challengeRepo,
      webAuthnConfig: webauthnConfig,
      logger,
    });
  });

  it('creates an authentication challenge with empty allowCredentials (usernameless flow)', async () => {
    const result = await service.execute();

    expect(result.options.allowCredentials).toEqual([]);
    expect(result.options.userVerification).toBe('required');
    expect(result.options.rpId).toBe(webauthnConfig.rpId);
    expect(challengeRepo.save).toHaveBeenCalledOnce();
  });
});
