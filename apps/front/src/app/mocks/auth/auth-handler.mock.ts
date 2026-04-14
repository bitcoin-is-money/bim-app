import {HttpResponse} from '@angular/common/http';
import {WebauthnUserHandleDecoder} from '@bim/lib/auth';
import {type Account, type ApiErrorResponse, ErrorCode} from '../../model';
import type {
  AuthResponse,
  BeginAuthResponse,
  BeginRegisterResponse,
  UserSessionResponse,
} from '../../services/auth.service';
import type {DataStoreMock, StoredCredential} from '../data-store.mock';
import {createErrorResponse} from '../mock-error';
import {getMockUser, type MockUserProfile} from '../mock-users';

const SWAPS_STORAGE_KEY = 'bim:swaps';

// Predictable test Starknet address based on username
function generateStarknetAddress(username: string): string {
  const hash = [...username].reduce((acc, char) => acc + (char.codePointAt(0) ?? 0), 0);
  const paddedHash = hash.toString(16).padStart(8, '0');
  return `0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7${paddedHash}`;
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replaceAll(/[xy]/g, (char) => {
    const rand = Math.trunc(Math.random() * 16); // NOSONAR S2245 - mock UUID for dev only, not security-sensitive
    const value = char === 'x' ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
}

function generateChallenge(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  // Convert to base64url (no padding, - instead of +, _ instead of /)
  return btoa(String.fromCodePoint(...array))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/={1,2}$/, '');
}

export class AuthHandlerMock {
  private readonly RP_ID = 'localhost';
  private readonly RP_NAME = 'BIM App (Mock)';

  constructor(private readonly store: DataStoreMock) {}

  /**
   * Load existing swaps from the user profile into localStorage.
   * This simulates swaps that already exist for the user.
   */
  private loadExistingSwaps(profile: MockUserProfile): void {
    if (profile.existingSwaps.length > 0) {
      localStorage.setItem(SWAPS_STORAGE_KEY, JSON.stringify(profile.existingSwaps));
    }
  }

  // POST /api/auth/register/begin
  beginRegister(body: {username: string}): HttpResponse<BeginRegisterResponse | ApiErrorResponse> {
    const {username} = body;

    // Error: user already exists
    const existing = this.store.findCredentialByUsername(username);
    if (existing) {
      return createErrorResponse(409, ErrorCode.ACCOUNT_ALREADY_EXISTS, 'Username already taken');
    }

    const challengeId = generateUUID();
    const challenge = generateChallenge();
    const accountId = generateUUID(); // Pre-generate account ID

    this.store.saveChallenge({
      challengeId,
      challenge,
      username,
      type: 'registration',
      expiresAt: Date.now() + 60000,
    });

    return new HttpResponse({
      status: 200,
      body: {
        challengeId,
        accountId, // Return accountId to pass to completeRegister
        options: {
          challenge,
          rpId: this.RP_ID,
          rpName: this.RP_NAME,
          userId: accountId, // Use accountId as userId for WebAuthn
          userName: username,
          timeoutMs: 60000,
        },
      },
    });
  }

  // POST /api/auth/register/complete
  completeRegister(body: {
    challengeId: string;
    accountId: string;
    username: string;
    credential: {
      id: string;
      rawId: string;
      response: {clientDataJSON: string; attestationObject: string};
      type: string;
    };
  }): HttpResponse<AuthResponse | ApiErrorResponse> {
    const {challengeId, accountId, username, credential} = body;

    const pendingChallenge = this.store.consumeChallenge(challengeId);
    if (!pendingChallenge) {
      return createErrorResponse(400, ErrorCode.CHALLENGE_NOT_FOUND, 'Challenge not found');
    }

    if (pendingChallenge.type !== 'registration') {
      return createErrorResponse(400, ErrorCode.CHALLENGE_EXPIRED, 'Challenge type mismatch');
    }

    if (pendingChallenge.expiresAt < Date.now()) {
      return createErrorResponse(400, ErrorCode.CHALLENGE_EXPIRED, 'Challenge expired');
    }

    // Store credential using the accountId passed from beginRegister
    const storedCredential: StoredCredential = {
      credentialId: credential.id,
      publicKey: credential.response.attestationObject,
      userId: accountId, // Use accountId from input - same as userHandle in credential
      username,
      counter: 0,
    };
    this.store.saveCredential(storedCredential);

    const account: Account = {
      id: accountId,
      username,
      starknetAddress: null, // Not yet set — will be set on deploy
      status: 'pending',
    };

    const mockProfile = getMockUser(username);
    this.store.setSession(account);
    this.store.setRegistrationDate(new Date());
    this.store.setMockUserProfile(mockProfile);
    this.loadExistingSwaps(mockProfile);

    return new HttpResponse({
      status: 200,
      body: {account},
    });
  }

  // POST /api/auth/login/begin (username-less - discoverable credentials)
  beginLogin(): HttpResponse<BeginAuthResponse> {
    const challengeId = generateUUID();
    const challenge = generateChallenge();

    this.store.saveChallenge({
      challengeId,
      challenge,
      type: 'authentication',
      expiresAt: Date.now() + 60000,
    });

    return new HttpResponse({
      status: 200,
      body: {
        challengeId,
        options: {
          challenge,
          rpId: this.RP_ID,
          allowCredentials: [],
          timeoutMs: 60000,
          userVerification: 'required',
        },
      },
    });
  }

  // POST /api/auth/login/complete (usernameless - uses userHandle to identify user)
  completeLogin(body: {
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
      type: string;
    };
  }): HttpResponse<AuthResponse | ApiErrorResponse> {
    const {challengeId, credential} = body;

    const pendingChallenge = this.store.consumeChallenge(challengeId);
    if (!pendingChallenge) {
      return createErrorResponse(400, ErrorCode.CHALLENGE_NOT_FOUND, 'Challenge not found');
    }

    if (pendingChallenge.type !== 'authentication') {
      return createErrorResponse(400, ErrorCode.CHALLENGE_EXPIRED, 'Challenge type mismatch');
    }

    if (pendingChallenge.expiresAt < Date.now()) {
      return createErrorResponse(400, ErrorCode.CHALLENGE_EXPIRED, 'Challenge expired');
    }

    // For username-less flow, use userHandle to find the credential
    const userHandle = credential.response.userHandle;
    if (!userHandle) {
      return createErrorResponse(401, ErrorCode.AUTHENTICATION_FAILED, 'No userHandle in credential response');
    }

    const userId = WebauthnUserHandleDecoder.decodeToUuid(userHandle);
    const storedCredential = this.store.findCredentialByUserId(userId);
    if (!storedCredential) {
      return createErrorResponse(401, ErrorCode.AUTHENTICATION_FAILED, 'Invalid credential');
    }

    // In a real backend, you'd verify the signature here
    // For mock, we just trust the credential exists

    storedCredential.counter += 1;
    this.store.saveCredential(storedCredential);

    const account: Account = {
      id: storedCredential.userId,
      username: storedCredential.username,
      starknetAddress: generateStarknetAddress(storedCredential.username),
      status: 'deployed',
    };

    const mockProfile = getMockUser(storedCredential.username);
    this.store.setSession(account);
    this.store.setMockUserProfile(mockProfile);
    this.loadExistingSwaps(mockProfile);

    return new HttpResponse({
      status: 200,
      body: {account, updateApp: mockProfile.updateApp},
    });
  }

  // GET /api/auth/session
  getSession(): HttpResponse<UserSessionResponse> {
    const account = this.store.getSession();
    const body: UserSessionResponse = account ? {authenticated: true, account} : {authenticated: false};
    return new HttpResponse({status: 200, body});
  }

  // POST /api/auth/logout
  logout(): HttpResponse<void> {
    this.store.setSession(null);
    return new HttpResponse({status: 200});
  }
}
