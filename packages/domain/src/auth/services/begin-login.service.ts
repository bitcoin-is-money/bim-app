import type {Logger} from 'pino';
import type {ChallengeRepository} from '../../ports';
import {Challenge} from '../challenge';
import type {BeginLoginOutput, BeginLoginUseCase} from '../use-cases/begin-login.use-case';
import type {WebAuthnConfig} from '../webauthn.types';

export interface BeginLoginDeps {
  challengeRepository: ChallengeRepository;
  webAuthnConfig: WebAuthnConfig;
  logger: Logger;
}

/**
 * Initiates WebAuthn authentication using discoverable credentials (username-less).
 * Returns options to pass to navigator.credentials.get() with empty allowCredentials.
 */
export class BeginLogin implements BeginLoginUseCase {
  private readonly log: Logger;

  constructor(private readonly deps: BeginLoginDeps) {
    this.log = deps.logger.child({name: 'begin-login.service.ts'});
  }

  async execute(): Promise<BeginLoginOutput> {
    const challenge = Challenge.createForAuthentication({
      rpId: this.deps.webAuthnConfig.rpId,
      origin: this.deps.webAuthnConfig.origin,
    });

    await this.deps.challengeRepository.save(challenge);

    return {
      options: {
        challenge: challenge.challenge,
        rpId: this.deps.webAuthnConfig.rpId,
        allowCredentials: [],
        timeoutMs: 60000,
        userVerification: 'required',
      },
      challengeId: challenge.id,
    };
  }
}
