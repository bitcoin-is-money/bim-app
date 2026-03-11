import {WebauthnUserHandleDecoder} from "@bim/lib/auth";

import type {Logger} from 'pino';
import {Account, AccountAlreadyExistsError, AccountId, AccountNotFoundError, CredentialId} from '../account';
import type {AccountRepository, ChallengeRepository, SessionRepository, TransactionManager, WebAuthnGateway,} from '../ports';
import {Challenge} from './challenge';
import {Session} from './session';
import {
  AuthenticationFailedError,
  ChallengeNotFoundError,
  InvalidChallengeError,
  RegistrationFailedError,
} from './errors';
import {ChallengeId} from './types';
import type {WebAuthnAuthenticationOptions, WebAuthnRegistrationOptions} from './webauthn.types';

// =============================================================================
// Dependencies
// =============================================================================

export interface AuthServiceDeps {
  accountRepository: AccountRepository;
  challengeRepository: ChallengeRepository;
  sessionRepository: SessionRepository;
  transactionManager: TransactionManager;
  webAuthnGateway: WebAuthnGateway;
  logger: Logger;
}

export interface WebAuthnConfig {
  rpId: string;
  rpName: string;
  origin: string;
}

// =============================================================================
// Input/Output Types - Registration
// =============================================================================

export interface BeginRegistrationInput {
  username: string;
}

export interface BeginRegistrationOutput {
  options: WebAuthnRegistrationOptions;
  challengeId: string;
  accountId: string;
}

export interface CompleteRegistrationInput {
  challengeId: string;
  accountId: string;
  username: string;
  credential: {
    id: string;
    rawId: string;
    response: {
      clientDataJSON: string;
      attestationObject: string;
    };
    type: 'public-key';
  };
}

export interface CompleteRegistrationOutput {
  account: Account;
  session: Session;
}

// =============================================================================
// Input/Output Types - Authentication
// =============================================================================

export interface BeginAuthenticationOutput {
  options: WebAuthnAuthenticationOptions;
  challengeId: string;
}

export interface CompleteAuthenticationInput {
  challengeId: string;
  credential: {
    id: string;
    rawId: string;
    response: {
      clientDataJSON: string;
      authenticatorData: string;
      signature: string;
      userHandle?: string;
    };
    type: 'public-key';
  };
}

export interface CompleteAuthenticationOutput {
  account: Account;
  session: Session;
}

// =============================================================================
// Service Class
// =============================================================================

/**
 * Service for WebAuthn authentication and registration.
 */
export class AuthService {
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

    // Validate the challenge
    const challengeId = ChallengeId.of(input.challengeId);
    const challenge = await this.deps.challengeRepository.findById(challengeId);
    if (!challenge) {
      throw new ChallengeNotFoundError(challengeId);
    }
    challenge.consume();

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

    const session = Session.create(account.id);

    // Persist atomically
    await this.deps.transactionManager.execute(async () => {
      await this.deps.challengeRepository.save(challenge);
      await this.deps.accountRepository.save(account);
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
    // Validate the challenge
    const challengeId = ChallengeId.of(input.challengeId);
    const challenge = await this.deps.challengeRepository.findById(challengeId);
    if (!challenge) {
      throw new ChallengeNotFoundError(challengeId);
    }
    challenge.consume();

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

    const session = Session.create(account.id);

    // Persist atomically
    await this.deps.transactionManager.execute(async () => {
      await this.deps.challengeRepository.save(challenge);
      await this.deps.accountRepository.save(account);
      await this.deps.sessionRepository.save(session);
    });

    this.log.info({accountId: account.id}, 'Authentication completed');
    return {account, session};
  }
}
