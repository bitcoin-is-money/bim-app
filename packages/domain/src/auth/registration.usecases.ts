import {Account, AccountAlreadyExistsError, AccountId, CredentialId} from '../account';
import type {
  AccountRepository,
  ChallengeRepository,
  SessionRepository,
  StarknetGateway,
  WebAuthnGateway
} from '../ports';
import {Challenge} from './challenge';
import {Session} from './session';
import {ChallengeId, ChallengeNotFoundError, RegistrationFailedError, type WebAuthnRegistrationOptions,} from './types';

// =============================================================================
// Shared Dependencies
// =============================================================================

export interface RegistrationUseCasesDeps {
  accountRepository: AccountRepository;
  challengeRepository: ChallengeRepository;
  sessionRepository: SessionRepository;
  webAuthnGateway: WebAuthnGateway;
  starknetGateway: StarknetGateway;
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

export type BeginRegistrationUseCase = (input: BeginRegistrationInput) => Promise<BeginRegistrationOutput>;

/**
 * Initiates WebAuthn registration by creating a challenge.
 * Returns options to pass to navigator.credentials.create().
 *
 * The userId returned in options will become the account ID after registration.
 * The accountId is returned separately and must be passed to completeRegistration.
 * This ensures the userHandle in the credential matches the account ID (required for username-less login).
 */
export function getBeginRegistrationUseCase(
  deps: Pick<RegistrationUseCasesDeps, 'challengeRepository' | 'idGenerator'>,
): BeginRegistrationUseCase {
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

export type CompleteRegistrationUseCase = (input: CompleteRegistrationInput) => Promise<CompleteRegistrationOutput>;

/**
 * Completes WebAuthn registration after user interaction.
 * Verifies the credential, creates an account with its Starknet address, and starts a session.
 *
 * The accountId is passed from beginRegistration to ensure the userHandle in the credential
 * matches the account ID (required for username-less login).
 */
export function getCompleteRegistrationUseCase(
  deps: Omit<RegistrationUseCasesDeps, 'idGenerator'>,
): CompleteRegistrationUseCase {
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

    // Check username availability
    const existingAccount = await deps.accountRepository.findByUsername(input.username);
    if (existingAccount) {
      throw new AccountAlreadyExistsError(input.username);
    }

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

    // Compute deterministic Starknet address
    const starknetAddress = await deps.starknetGateway.calculateAccountAddress({
      publicKey: verification.starknetPublicKeyX,
    });

    // Create an account using the ID from input (matches userHandle in credential)
    const account = Account.create({
      id: accountId,
      username: input.username,
      credentialId: CredentialId.of(verification.encodedCredentialId),
      publicKey: verification.starknetPublicKeyX,
      credentialPublicKey: verification.encodedCredentialPublicKey,
    });
    account.setStarknetAddress(starknetAddress);

    const session = Session.create(account.id);

    // Persist
    await deps.challengeRepository.save(challenge);
    await deps.accountRepository.save(account);
    await deps.sessionRepository.save(session);

    return { account, session };
  };
}
