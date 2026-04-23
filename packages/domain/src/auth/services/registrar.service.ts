import type {Logger} from 'pino';
import {Account, AccountAlreadyExistsError, AccountId, CredentialId} from '../../account';
import type {
  AccountRepository,
  ChallengeRepository,
  SessionRepository,
  TransactionManager,
  WebAuthnGateway,
} from '../../ports';
import {Challenge, ChallengeId} from '../challenge';
import {InvalidChallengeError, RegistrationFailedError} from '../errors';
import {Session} from '../session';
import type {SessionConfig} from '../session.config';
import type {
  BeginRegistrationInput,
  BeginRegistrationOutput,
  BeginRegistrationUseCase,
} from '../use-cases/begin-registration.use-case';
import type {
  CompleteRegistrationInput,
  CompleteRegistrationOutput,
  CompleteRegistrationUseCase,
} from '../use-cases/complete-registration.use-case';
import type {WebAuthnConfig} from '../webauthn.types';
import type {ChallengeConsumer} from './challenge-consumer.service';

export interface RegistrarDeps {
  accountRepository: AccountRepository;
  sessionRepository: SessionRepository;
  challengeRepository: ChallengeRepository;
  transactionManager: TransactionManager;
  webAuthnGateway: WebAuthnGateway;
  challengeConsumer: ChallengeConsumer;
  sessionConfig: SessionConfig;
  webAuthnConfig: WebAuthnConfig;
  logger: Logger;
}

/**
 * Handles the WebAuthn registration flow in two phases: `begin` creates a
 * short-lived challenge; `complete` verifies the credential and creates the
 * account + initial session atomically.
 */
export class Registrar implements BeginRegistrationUseCase, CompleteRegistrationUseCase {
  private readonly log: Logger;

  constructor(private readonly deps: RegistrarDeps) {
    this.log = deps.logger.child({name: 'registrar.service.ts'});
  }

  /**
   * Initiates WebAuthn registration by creating a challenge.
   * Returns options to pass to navigator.credentials.create().
   */
  async begin({username}: BeginRegistrationInput): Promise<BeginRegistrationOutput> {
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

  /**
   * Completes WebAuthn registration after user interaction.
   * Verifies the credential, creates an account, and starts a session.
   *
   * @throws AccountAlreadyExistsError if username already exists
   * @throws ChallengeNotFoundError | ChallengeExpiredError | ChallengeAlreadyUsedError
   *         via ChallengeConsumer when the challenge can't be consumed
   * @throws InvalidChallengeError on purpose / accountId / RP mismatch
   * @throws RegistrationFailedError if WebAuthn verification fails
   */
  async complete(input: CompleteRegistrationInput): Promise<CompleteRegistrationOutput> {
    // Check if the username already exists
    const usernameExists = await this.deps.accountRepository.existsByUsername(input.username);
    if (usernameExists) {
      throw new AccountAlreadyExistsError(input.username);
    }

    // Atomically consume the challenge (prevents TOCTOU race condition)
    const challengeId = ChallengeId.of(input.challengeId);
    const challenge = await this.deps.challengeConsumer.consume(challengeId);

    // Verify challenge purpose
    if (challenge.purpose !== 'registration') {
      throw new InvalidChallengeError(challengeId, 'challenge is not for registration');
    }

    // Verify the accountId matches the one bound to the challenge
    const accountId = AccountId.of(input.accountId);
    if (challenge.accountId !== input.accountId) {
      throw new InvalidChallengeError(challengeId, 'accountId does not match challenge');
    }

    // Validate challenge has required WebAuthn fields
    if (!challenge.origin || !challenge.rpId) {
      throw new InvalidChallengeError(challengeId, 'missing origin or rpId');
    }

    // Verify WebAuthn credential
    const verification = await this.deps.webAuthnGateway.verifyRegistration({
      expectedChallenge: challenge.challenge,
      expectedOrigin: challenge.origin,
      expectedRPID: challenge.rpId,
      credential: input.credential,
    });

    if (!verification.verified) {
      throw new RegistrationFailedError('WebAuthn verification failed');
    }

    // Create the account
    const account = Account.create({
      id: accountId,
      username: input.username,
      credentialId: CredentialId.of(verification.encodedCredentialId),
      publicKey: verification.starknetPublicKeyX,
      credentialPublicKey: verification.encodedCredentialPublicKey,
    });

    const session = Session.create(account.id, this.deps.sessionConfig.durationMs);

    // Persist atomically (challenge already consumed atomically above).
    // Delete any prior sessions so only the latest login is valid (single-session).
    await this.deps.transactionManager.execute(async () => {
      await this.deps.accountRepository.save(account);
      await this.deps.sessionRepository.deleteByAccountId(account.id);
      await this.deps.sessionRepository.save(session);
    });

    this.log.info({accountId: account.id, username: input.username}, 'Registration completed');
    return {account, session};
  }
}
