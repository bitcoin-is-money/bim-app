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
}

export type BeginRegistrationUseCase = (input: BeginRegistrationInput) => Promise<BeginRegistrationOutput>;

/**
 * Initiates WebAuthn registration by creating a challenge.
 * Returns options to pass to navigator.credentials.create().
 */
export function getBeginRegistrationUseCase(
  deps: Pick<RegistrationUseCasesDeps, 'challengeRepository'>,
): BeginRegistrationUseCase {
  return async (input: BeginRegistrationInput): Promise<BeginRegistrationOutput> => {
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
        userId: crypto.randomUUID(),
        userName: input.username,
        timeout: 60000,
      },
      challengeId: challenge.id,
    };
  };
}

// =============================================================================
// Complete Registration
// =============================================================================

export interface CompleteRegistrationInput {
  challengeId: string;
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
 */
export function getCompleteRegistrationUseCase(
  deps: RegistrationUseCasesDeps,
): CompleteRegistrationUseCase {
  return async (input: CompleteRegistrationInput): Promise<CompleteRegistrationOutput> => {
    // Validate the challenge
    const challengeId = ChallengeId.of(input.challengeId);
    const challenge = await deps.challengeRepository.findById(challengeId);
    if (!challenge) {
      throw new ChallengeNotFoundError(challengeId);
    }
    challenge.consume();

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

    // Create account and session
    const account = Account.create({
      id: deps.idGenerator(),
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
