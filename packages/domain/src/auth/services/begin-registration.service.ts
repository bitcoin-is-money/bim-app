import type {Logger} from 'pino';
import {AccountId} from '../../account';
import type {ChallengeRepository} from '../../ports';
import {Challenge} from '../challenge';
import type {
  BeginRegistrationInput,
  BeginRegistrationOutput,
  BeginRegistrationUseCase,
} from '../use-cases/begin-registration.use-case';
import type {WebAuthnConfig} from '../webauthn.types';

export interface BeginRegistrationDeps {
  challengeRepository: ChallengeRepository;
  webAuthnConfig: WebAuthnConfig;
  logger: Logger;
}

/**
 * Initiates WebAuthn registration by creating a challenge.
 * Returns options to pass to navigator.credentials.create().
 */
export class BeginRegistration implements BeginRegistrationUseCase {
  private readonly log: Logger;

  constructor(private readonly deps: BeginRegistrationDeps) {
    this.log = deps.logger.child({name: 'begin-registration.service.ts'});
  }

  async execute({username}: BeginRegistrationInput): Promise<BeginRegistrationOutput> {
    // Generate account ID now — stored as userHandle in the credential.
    const accountId = AccountId.generate();

    const challenge = Challenge.createForRegistration({
      rpId: this.deps.webAuthnConfig.rpId,
      origin: this.deps.webAuthnConfig.origin,
      accountId,
    });

    await this.deps.challengeRepository.save(challenge);

    this.log.info({username}, 'Registration started');
    return {
      options: {
        challenge: challenge.challenge,
        rpId: this.deps.webAuthnConfig.rpId,
        rpName: this.deps.webAuthnConfig.rpName,
        userId: accountId,
        userName: username,
        timeoutMs: 60000,
      },
      challengeId: challenge.id,
      accountId,
    };
  }
}
