import type {DomainError} from "@bim/domain/shared";
import {WebauthnUserHandleDecoder} from "@bim/lib/auth";

import type {Logger} from 'pino';
import {Account, AccountAlreadyExistsError, AccountId, AccountNotFoundError, CredentialId} from '../account';
import type {
  AccountRepository,
  ChallengeRepository,
  SessionRepository,
  TransactionManager,
  WebAuthnGateway,
} from '../ports';
import {Challenge, ChallengeId} from './challenge';
import {
  AuthenticationFailedError,
  ChallengeAlreadyUsedError,
  ChallengeNotFoundError,
  InvalidChallengeError,
  RegistrationFailedError,
} from './errors';
import {Session} from './session';
import type {SessionConfig} from './session.config';
import type {BeginAuthenticationOutput, BeginLoginUseCase} from './use-case/begin-login.use-case';
import type {BeginRegistrationInput, BeginRegistrationOutput, BeginRegistrationUseCase} from './use-case/begin-registration.use-case';
import type {CompleteAuthenticationInput, CompleteAuthenticationOutput, CompleteLoginUseCase} from './use-case/complete-login.use-case';
import type {CompleteRegistrationInput, CompleteRegistrationOutput, CompleteRegistrationUseCase} from './use-case/complete-registration.use-case';

// =============================================================================
// Dependencies
// =============================================================================

export interface AuthServiceDeps {
  accountRepository: AccountRepository;
  challengeRepository: ChallengeRepository;
  sessionRepository: SessionRepository;
  transactionManager: TransactionManager;
  webAuthnGateway: WebAuthnGateway;
  sessionConfig: SessionConfig;
  logger: Logger;
}

export interface WebAuthnConfig {
  rpId: string;
  rpName: string;
  origin: string;
}

// Re-export UseCase types for backward compatibility
export type {BeginRegistrationInput, BeginRegistrationOutput} from './use-case/begin-registration.use-case';
export type {CompleteRegistrationInput, CompleteRegistrationOutput} from './use-case/complete-registration.use-case';
export type {BeginAuthenticationOutput} from './use-case/begin-login.use-case';
export type {CompleteAuthenticationInput, CompleteAuthenticationOutput} from './use-case/complete-login.use-case';

// =============================================================================
// Service Class
// =============================================================================

/**
 * Service for WebAuthn authentication and registration.
 */
export class AuthService implements BeginRegistrationUseCase, CompleteRegistrationUseCase, BeginLoginUseCase, CompleteLoginUseCase {
  private readonly log: Logger;

  constructor(
    private readonly deps: AuthServiceDeps,
    private readonly config: WebAuthnConfig,
  ) {
    this.log = deps.logger.child({name: 'auth.service.ts'});
  }

  // ===========================================================================
  // Registration
  // ===========================================================================

  /**
   * Initiates WebAuthn registration by creating a challenge.
   * Returns options to pass to navigator.credentials.create().
   */
  async beginRegistration(input: BeginRegistrationInput): Promise<BeginRegistrationOutput> {
    // Generate account ID now - this will be stored as userHandle in the credential
    const accountId = AccountId.generate();

    const challenge = Challenge.createForRegistration({
      rpId: this.config.rpId,
      origin: this.config.origin,
      accountId,
    });

    await this.deps.challengeRepository.save(challenge);

    this.log.info({username: input.username}, 'Registration started');
    return {
      options: {
        challenge: challenge.challenge,
        rpId: this.config.rpId,
        rpName: this.config.rpName,
        userId: accountId,
        userName: input.username,
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
   * @throws ChallengeNotFoundError if challenge doesn't exist
   * @throws ChallengeExpiredError if challenge has expired
   * @throws AccountAlreadyExistsError if username already exists
   * @throws RegistrationFailedError if WebAuthn verification fails
   */
  async completeRegistration(
    input: CompleteRegistrationInput,
  ): Promise<CompleteRegistrationOutput> {
    // Check if the username already exists
    const usernameExists = await this.deps.accountRepository.existsByUsername(input.username);
    if (usernameExists) {
      throw new AccountAlreadyExistsError(input.username);
    }

    // Atomically consume the challenge (prevents TOCTOU race condition)
    const challengeId = ChallengeId.of(input.challengeId);
    const challenge = await this.deps.challengeRepository.consumeById(challengeId);
    if (!challenge) {
      throw await this.throwChallengeConsumptionError(challengeId);
    }

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

    // Persist atomically (challenge already consumed atomically above)
    // Delete any prior sessions so only the latest login is valid (single-session).
    await this.deps.transactionManager.execute(async () => {
      await this.deps.accountRepository.save(account);
      await this.deps.sessionRepository.deleteByAccountId(account.id);
      await this.deps.sessionRepository.save(session);
    });

    this.log.info({accountId: account.id, username: input.username}, 'Registration completed');
    return {account, session};
  }

  // ===========================================================================
  // Authentication
  // ===========================================================================

  /**
   * Initiates WebAuthn authentication using discoverable credentials (username-less).
   * Returns options to pass to navigator.credentials.get() with empty allowCredentials.
   */
  async beginAuthentication(): Promise<BeginAuthenticationOutput> {
    const challenge = Challenge.createForAuthentication({
      rpId: this.config.rpId,
      origin: this.config.origin,
    });

    await this.deps.challengeRepository.save(challenge);

    return {
      options: {
        challenge: challenge.challenge,
        rpId: this.config.rpId,
        allowCredentials: [],
        timeoutMs: 60000,
        userVerification: 'required',
      },
      challengeId: challenge.id,
    };
  }

  /**
   * Completes WebAuthn authentication after user interaction.
   * Verifies the signature, updates sign counter, and creates a session.
   *
   * @throws ChallengeNotFoundError if challenge doesn't exist
   * @throws ChallengeExpiredError if challenge has expired
   * @throws AuthenticationFailedError if WebAuthn verification fails
   * @throws AccountNotFoundError if the account doesn't exist
   */
  async completeAuthentication(
    input: CompleteAuthenticationInput,
  ): Promise<CompleteAuthenticationOutput> {
    // Atomically consume the challenge (prevents TOCTOU race condition)
    const challengeId = ChallengeId.of(input.challengeId);
    const challenge = await this.deps.challengeRepository.consumeById(challengeId);
    if (!challenge) {
      throw await this.throwChallengeConsumptionError(challengeId);
    }

    // Verify challenge purpose
    if (challenge.purpose !== 'authentication') {
      throw new InvalidChallengeError(challengeId, 'challenge is not for authentication');
    }

    // Username-less flow: decode userHandle to get AccountId
    const userHandle = input.credential.response.userHandle;
    if (!userHandle) {
      throw new AuthenticationFailedError('No userHandle in credential response');
    }
    const uuid = WebauthnUserHandleDecoder.decodeToUuid(userHandle);
    const accountId = AccountId.of(uuid);
    const account = await this.deps.accountRepository.findById(accountId);

    if (!account) {
      throw new AccountNotFoundError('Account not found');
    }

    // Validate challenge has required WebAuthn fields
    if (!challenge.origin || !challenge.rpId) {
      throw new InvalidChallengeError(challengeId, 'missing origin or rpId');
    }

    // Verify WebAuthn signature
    const verification = await this.deps.webAuthnGateway.verifyAuthentication({
      expectedChallenge: challenge.challenge,
      expectedOrigin: challenge.origin,
      expectedRPID: challenge.rpId,
      credential: input.credential,
      storedCredential: {
        credentialId: account.credentialId,
        publicKey: account.publicKey,
        credentialPublicKey: account.credentialPublicKey,
        signCount: account.getSignCount(),
      },
    });

    if (!verification.verified) {
      throw new AuthenticationFailedError('WebAuthn verification failed');
    }

    // Update sign counter (replay protection)
    if (verification.newSignCount > account.getSignCount()) {
      account.updateSignCount(verification.newSignCount);
    }

    const session = Session.create(account.id, this.deps.sessionConfig.durationMs);

    // Persist atomically (challenge already consumed atomically above)
    // Delete any prior sessions so only the latest login is valid (single-session).
    await this.deps.transactionManager.execute(async () => {
      await this.deps.accountRepository.save(account);
      await this.deps.sessionRepository.deleteByAccountId(account.id);
      await this.deps.sessionRepository.save(session);
    });

    this.log.info({accountId: account.id}, 'Authentication completed');
    return {account, session};
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * When atomic consumeById returns undefined, look up the challenge
   * to throw the most specific error (not found / expired / already used).
   */
  private async throwChallengeConsumptionError(challengeId: ChallengeId): Promise<DomainError> {
    const stale = await this.deps.challengeRepository.findById(challengeId);
    if (!stale) {
      throw new ChallengeNotFoundError(challengeId);
    }
    // Re-use the entity's own validation to get the precise error
    stale.validate();
    // If validate() didn't throw, the challenge was consumed between our atomic
    // UPDATE and this SELECT — which means a concurrent request won the race.
    throw new ChallengeAlreadyUsedError(challengeId);
  }
}
