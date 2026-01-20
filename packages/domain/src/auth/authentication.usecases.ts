import {Account, AccountNotFoundError} from '@bim/domain/account';
import type {AccountRepository, ChallengeRepository, SessionRepository, WebAuthnGateway} from '@bim/domain/ports';
import {Challenge} from './challenge';
import {Session} from './session';
import {
  AuthenticationFailedError,
  ChallengeId,
  ChallengeNotFoundError,
  type WebAuthnAuthenticationOptions,
} from './types';

// =============================================================================
// Shared Dependencies
// =============================================================================

export interface AuthenticationUseCasesDeps {
  accountRepository: AccountRepository;
  challengeRepository: ChallengeRepository;
  sessionRepository: SessionRepository;
  webAuthnGateway: WebAuthnGateway;
}

// =============================================================================
// Begin Authentication
// =============================================================================

export interface BeginAuthenticationInput {
  username: string;
  rpId: string;
  origin: string;
}

export interface BeginAuthenticationOutput {
  options: WebAuthnAuthenticationOptions;
  challengeId: string;
}

export type BeginAuthenticationUseCase = (input: BeginAuthenticationInput) => Promise<BeginAuthenticationOutput>;

/**
 * Initiates WebAuthn authentication for an existing user.
 * Returns options to pass to navigator.credentials.get().
 */
export function getBeginAuthenticationUseCase(
  deps: Pick<AuthenticationUseCasesDeps, 'accountRepository' | 'challengeRepository'>,
): BeginAuthenticationUseCase {
  return async (input: BeginAuthenticationInput): Promise<BeginAuthenticationOutput> => {
    const account = await deps.accountRepository.findByUsername(input.username);
    if (!account) {
      throw new AccountNotFoundError(input.username);
    }

    const challenge = Challenge.createForAuthentication({
      accountId: account.id,
      rpId: input.rpId,
      origin: input.origin,
    });

    await deps.challengeRepository.save(challenge);

    return {
      options: {
        challenge: challenge.challenge,
        rpId: input.rpId,
        allowCredentials: [{ id: account.credentialId, type: 'public-key' }],
        timeout: 60000,
      },
      challengeId: challenge.id,
    };
  };
}

// =============================================================================
// Complete Authentication
// =============================================================================

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

export type CompleteAuthenticationUseCase = (input: CompleteAuthenticationInput) => Promise<CompleteAuthenticationOutput>;

/**
 * Completes WebAuthn authentication after user interaction.
 * Verifies the signature, updates sign counter, and creates a session.
 */
export function getCompleteAuthenticationUseCase(
  deps: AuthenticationUseCasesDeps
): CompleteAuthenticationUseCase {
  return async (input: CompleteAuthenticationInput): Promise<CompleteAuthenticationOutput> => {
    // Validate the challenge
    const challengeId = ChallengeId.of(input.challengeId);
    const challenge = await deps.challengeRepository.findById(challengeId);
    if (!challenge) {
      throw new ChallengeNotFoundError(challengeId);
    }
    challenge.consume();

    // Load associated account
    if (!challenge.accountId) {
      throw new AuthenticationFailedError('Challenge has no associated account');
    }
    const account = await deps.accountRepository.findById(challenge.accountId);
    if (!account) {
      throw new AccountNotFoundError(challenge.accountId);
    }

    // Verify WebAuthn signature
    const verification = await deps.webAuthnGateway.verifyAuthentication({
      expectedChallenge: challenge.challenge,
      expectedOrigin: challenge.origin!,
      expectedRPID: challenge.rpId!,
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

    // Persist
    await deps.challengeRepository.save(challenge);
    await deps.accountRepository.save(account);
    await deps.sessionRepository.save(session);

    return { account, session };
  };
}
