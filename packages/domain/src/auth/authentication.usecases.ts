import {Account, AccountId, AccountNotFoundError} from '../account';
import type {AccountRepository, ChallengeRepository, SessionRepository, WebAuthnGateway} from '../ports';
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
  rpId: string;
  origin: string;
}

export interface BeginAuthenticationOutput {
  options: WebAuthnAuthenticationOptions;
  challengeId: string;
}

export type BeginAuthenticationUseCase = (input: BeginAuthenticationInput) => Promise<BeginAuthenticationOutput>;

/**
 * Initiates WebAuthn authentication using discoverable credentials (usernameless).
 * Returns options to pass to navigator.credentials.get() with empty allowCredentials.
 * The authenticator will show all resident keys for this RP.
 */
export function getBeginAuthenticationUseCase(
  deps: Pick<AuthenticationUseCasesDeps, 'challengeRepository'>,
): BeginAuthenticationUseCase {
  return async (input: BeginAuthenticationInput): Promise<BeginAuthenticationOutput> => {
    const challenge = Challenge.createForAuthentication({
      rpId: input.rpId,
      origin: input.origin,
    });

    await deps.challengeRepository.save(challenge);

    return {
      options: {
        challenge: challenge.challenge,
        rpId: input.rpId,
        allowCredentials: [],
        timeout: 60000,
        userVerification: 'required',
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
 * For usernameless flow, the account is looked up via userHandle (which contains the AccountId).
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

    // Load associated account - either from challenge or from userHandle (discoverable credentials)
    let account: Account | undefined;

    if (challenge.accountId) {
      // Traditional flow with pre-identified account
      account = await deps.accountRepository.findById(challenge.accountId);
    } else {
      // Usernameless flow: decode userHandle to get AccountId
      const userHandle = input.credential.response.userHandle;
      if (!userHandle) {
        throw new AuthenticationFailedError('No userHandle in credential response');
      }
      const accountId = AccountId.of(decodeUserHandle(userHandle));
      account = await deps.accountRepository.findById(accountId);
    }

    if (!account) {
      throw new AccountNotFoundError('Account not found');
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

// =============================================================================
// Helpers
// =============================================================================

/**
 * Decodes the userHandle (base64url) back to a UUID string.
 * The userHandle contains the AccountId that was set during registration.
 */
function decodeUserHandle(base64Url: string): string {
  // Decode base64url to bytes
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(base64 + padding);
  const bytes = new Uint8Array(binary.length);
  for (let idx = 0; idx < binary.length; idx++) {
    bytes[idx] = binary.charCodeAt(idx);
  }

  // Convert bytes to UUID format
  const hex = Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
