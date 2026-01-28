import {
  Account,
  AccountAlreadyExistsError,
  AccountId,
  type CreateAccountService,
  CredentialId,
  getCreateAccountService
} from '../account';
import type {
  AccountRepository,
  ChallengeRepository,
  SessionRepository,
  WebAuthnGateway
} from '../ports';
import {Challenge} from './challenge';
import {Session} from './session';
import {ChallengeId, ChallengeNotFoundError, RegistrationFailedError, type WebAuthnRegistrationOptions,} from './types';

// =============================================================================
// Shared Dependencies
// =============================================================================

export interface RegistrationServicesDeps {
  accountRepository: AccountRepository;
  challengeRepository: ChallengeRepository;
  sessionRepository: SessionRepository;
  webAuthnGateway: WebAuthnGateway;
  idGenerator: () => AccountId;
}

// =============================================================================
// Begin Registration
// =============================================================================

export interface BeginRegistrationInput {
  username: string;
  rpId: string;
  rpName: string;
  origin: string;
}

export interface BeginRegistrationOutput {
  options: WebAuthnRegistrationOptions;
  challengeId: string;
  accountId: string; // Pre-generated account ID (same as options.userId) - must be passed to completeRegistration
}

export type BeginRegistrationService = (input: BeginRegistrationInput) => Promise<BeginRegistrationOutput>;

/**
 * Initiates WebAuthn registration by creating a challenge.
 * Returns options to pass to navigator.credentials.create().
 *
 * The userId returned in options will become the account ID after registration.
 * The accountId is returned separately and must be passed to completeRegistration.
 * This ensures the userHandle in the credential matches the account ID (required for username-less login).
 */
export function getBeginRegistrationService(
  deps: Pick<RegistrationServicesDeps, 'challengeRepository' | 'idGenerator'>,
): BeginRegistrationService {
  return async (input: BeginRegistrationInput): Promise<BeginRegistrationOutput> => {
    // Generate account ID now - this will be stored as userHandle in the credential
    // and used as the account ID after registration completes
    const accountId = deps.idGenerator();

    // Don't store accountId in the challenge (FK constraint would fail since the account doesn't exist yet)
    const challenge = Challenge.createForRegistration({
      rpId: input.rpId,
      origin: input.origin,
    });

    await deps.challengeRepository.save(challenge);

    return {
      options: {
        challenge: challenge.challenge,
        rpId: input.rpId,
        rpName: input.rpName,
        userId: accountId, // Use the pre-generated account ID
        userName: input.username,
        timeout: 60000,
      },
      challengeId: challenge.id,
      accountId, // Return separately so the client can pass it to completeRegistration
    };
  };
}

// =============================================================================
// Complete Registration
// =============================================================================

export interface CompleteRegistrationInput {
  challengeId: string;
  accountId: string; // Pre-generated account ID from beginRegistration
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

export type CompleteRegistrationService = (input: CompleteRegistrationInput) => Promise<CompleteRegistrationOutput>;

/**
 * Completes WebAuthn registration after user interaction.
 * Verifies the credential, creates an account, and starts a session.
 * The Starknet address will be computed during deployment.
 *
 * The accountId is passed from beginRegistration to ensure the userHandle in the credential
 * matches the account ID (required for username-less login).
 */
export function getCompleteRegistrationService(
  deps: Omit<RegistrationServicesDeps, 'idGenerator'>,
): CompleteRegistrationService {
  return async (input: CompleteRegistrationInput): Promise<CompleteRegistrationOutput> => {
    // Validate the challenge
    const challengeId = ChallengeId.of(input.challengeId);
    const challenge = await deps.challengeRepository.findById(challengeId);
    if (!challenge) {
      throw new ChallengeNotFoundError(challengeId);
    }
    challenge.consume();

    // Parse the account ID from input (pre-generated during beginRegistration)
    const accountId = AccountId.of(input.accountId);

    // Verify WebAuthn credential
    const verification = await deps.webAuthnGateway.verifyRegistration({
      expectedChallenge: challenge.challenge,
      expectedOrigin: challenge.origin!,
      expectedRPID: challenge.rpId!,
      credential: input.credential,
    });

    if (!verification.verified) {
      throw new RegistrationFailedError('WebAuthn verification failed');
    }

    let createAccount: CreateAccountService = getCreateAccountService(deps);
    const account = await createAccount({
      accountId: accountId,
      username: input.username,
      credentialId: verification.encodedCredentialId,
      publicKey: verification.starknetPublicKeyX,
      credentialPublicKey: verification.encodedCredentialPublicKey,
    })

    const session = Session.create(account.id);

    // Persist
    await deps.challengeRepository.save(challenge);
    await deps.accountRepository.save(account);
    await deps.sessionRepository.save(session);

    return { account, session };
  };
}
