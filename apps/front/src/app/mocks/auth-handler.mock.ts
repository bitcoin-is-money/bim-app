import {HttpResponse} from '@angular/common/http';
import type {
  Account,
  AuthResponse,
  BeginAuthResponse,
  BeginRegisterResponse,
  UserSessionResponse,
} from '../services/auth.service';
import {DataStoreMock, type StoredCredential} from './data-store.mock';

// Predictable test Starknet address based on username
function generateStarknetAddress(username: string): string {
  const hash = username
    .split('')
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const paddedHash = hash.toString(16).padStart(8, '0');
  return `0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7${paddedHash}`;
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const rand = (Math.random() * 16) | 0;
    const value = char === 'x' ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
}

function generateChallenge(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  // Standard base64 (not base64url) - @stablelib/base64 expects this format
  return btoa(String.fromCharCode(...array));
}

export class AuthHandlerMock {
  private readonly store = new DataStoreMock();
  private readonly RP_ID = 'localhost';
  private readonly RP_NAME = 'BIM App (Mock)';

  // POST /api/auth/register/begin
  beginRegister(body: { username: string }): HttpResponse<BeginRegisterResponse | { error: string }> {
    const { username } = body;

    // Error: user already exists
    const existing = this.store.findCredentialByUsername(username);
    if (existing) {
      return new HttpResponse({
        status: 409,
        body: { error: 'User already exists' },
      });
    }

    const challengeId = generateUUID();
    const challenge = generateChallenge();
    const userId = generateUUID();

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
        options: {
          challenge,
          rpId: this.RP_ID,
          rpName: this.RP_NAME,
          userId,
          userName: username,
          timeout: 60000,
        },
      },
    });
  }

  // POST /api/auth/register/complete
  completeRegister(body: {
    challengeId: string;
    username: string;
    credential: {
      id: string;
      rawId: string;
      response: { clientDataJSON: string; attestationObject: string };
      type: string;
    };
  }): HttpResponse<AuthResponse | { error: string }> {
    const { challengeId, username, credential } = body;

    const pendingChallenge = this.store.consumeChallenge(challengeId);
    if (!pendingChallenge) {
      return new HttpResponse({
        status: 400,
        body: { error: 'Invalid or expired challenge' },
      });
    }

    if (pendingChallenge.type !== 'registration') {
      return new HttpResponse({
        status: 400,
        body: { error: 'Challenge type mismatch' },
      });
    }

    if (pendingChallenge.expiresAt < Date.now()) {
      return new HttpResponse({
        status: 400,
        body: { error: 'Challenge expired' },
      });
    }

    // Store credential (simplified - in real backend you'd parse attestationObject)
    const userId = generateUUID();
    const storedCredential: StoredCredential = {
      credentialId: credential.id,
      publicKey: credential.response.attestationObject,
      userId,
      username,
      counter: 0,
    };
    this.store.saveCredential(storedCredential);

    const account: Account = {
      id: userId,
      username,
      starknetAddress: generateStarknetAddress(username),
      status: 'active',
    };

    this.store.setSession(account);

    return new HttpResponse({
      status: 200,
      body: { account },
    });
  }

  // POST /api/auth/login/begin
  beginLogin(body: { username: string }): HttpResponse<BeginAuthResponse | { error: string }> {
    const { username } = body;

    const credential = this.store.findCredentialByUsername(username);
    if (!credential) {
      return new HttpResponse({
        status: 404,
        body: { error: 'User not found' },
      });
    }

    const challengeId = generateUUID();
    const challenge = generateChallenge();

    this.store.saveChallenge({
      challengeId,
      challenge,
      username,
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
          allowCredentials: [
            {
              id: credential.credentialId,
              type: 'public-key',
            },
          ],
          timeout: 60000,
          userVerification: 'required',
        },
      },
    });
  }

  // POST /api/auth/login/complete
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
  }): HttpResponse<AuthResponse | { error: string }> {
    const { challengeId, credential } = body;

    const pendingChallenge = this.store.consumeChallenge(challengeId);
    if (!pendingChallenge) {
      return new HttpResponse({
        status: 400,
        body: { error: 'Invalid or expired challenge' },
      });
    }

    if (pendingChallenge.type !== 'authentication') {
      return new HttpResponse({
        status: 400,
        body: { error: 'Challenge type mismatch' },
      });
    }

    if (pendingChallenge.expiresAt < Date.now()) {
      return new HttpResponse({
        status: 400,
        body: { error: 'Challenge expired' },
      });
    }

    const storedCredential = this.store.findCredentialById(credential.id);
    if (!storedCredential) {
      return new HttpResponse({
        status: 401,
        body: { error: 'Invalid credential' },
      });
    }

    // In a real backend, you'd verify the signature here
    // For mock, we just trust the credential exists

    storedCredential.counter += 1;
    this.store.saveCredential(storedCredential);

    const account: Account = {
      id: storedCredential.userId,
      username: storedCredential.username,
      starknetAddress: generateStarknetAddress(storedCredential.username),
      status: 'active',
    };

    this.store.setSession(account);

    return new HttpResponse({
      status: 200,
      body: { account },
    });
  }

  // GET /api/auth/session
  getSession(): HttpResponse<UserSessionResponse> {
    const account = this.store.getSession();
    const body: UserSessionResponse = account
      ? { authenticated: true, account }
      : { authenticated: false };
    return new HttpResponse({ status: 200, body });
  }

  // POST /api/auth/logout
  logout(): HttpResponse<void> {
    this.store.setSession(null);
    return new HttpResponse({ status: 200 });
  }
}
