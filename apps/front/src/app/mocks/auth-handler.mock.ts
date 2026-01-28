import {HttpResponse} from '@angular/common/http';
import {WebauthnUserHandleDecoder} from "@bim/lib/auth";
import {Account} from "../model";
import type {
  AuthResponse,
  BeginAuthResponse,
  BeginRegisterResponse,
  UserSessionResponse,
} from '../services/auth.service';
import {DataStoreMock, type StoredCredential} from './data-store.mock';

// If the registered username contains this string, the account deployment will mock a failed deployment
const ERROR_DEPLOY_USERNAME = 'errorDeploy';

// If the registered username contains this string, the account will have no transaction
const EMPTY_TRANSACTION_USERNAME = 'empty';


interface ApiErrorResponse {
  error: { message: string };
}

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
  // Convert to base64url (no padding, - instead of +, _ instead of /)
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export class AuthHandlerMock {
  private readonly RP_ID = 'localhost';
  private readonly RP_NAME = 'BIM App (Mock)';

  constructor(
    private readonly store: DataStoreMock
  ) {
  }

  // POST /api/auth/register/begin
  beginRegister(body: { username: string }): HttpResponse<BeginRegisterResponse | ApiErrorResponse> {
    const { username } = body;

    // Error: user already exists
    const existing = this.store.findCredentialByUsername(username);
    if (existing) {
      return new HttpResponse({
        status: 409,
        body: { error: { message: 'Username already taken' } },
      });
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
          timeout: 60000,
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
      response: { clientDataJSON: string; attestationObject: string };
      type: string;
    };
  }): HttpResponse<AuthResponse | ApiErrorResponse> {
    const { challengeId, accountId, username, credential } = body;

    const pendingChallenge = this.store.consumeChallenge(challengeId);
    if (!pendingChallenge) {
      return new HttpResponse({
        status: 400,
        body: { error: { message: 'Invalid or expired challenge' } },
      });
    }

    if (pendingChallenge.type !== 'registration') {
      return new HttpResponse({
        status: 400,
        body: { error: { message: 'Challenge type mismatch' } },
      });
    }

    if (pendingChallenge.expiresAt < Date.now()) {
      return new HttpResponse({
        status: 400,
        body: { error: { message: 'Challenge expired' } },
      });
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
      starknetAddress: generateStarknetAddress(username),
      status: 'pending',
    };

    this.store.setSession(account);
    this.store.setRegistrationDate(new Date());
    this.store.setFailedAccountDeployment(username.includes(ERROR_DEPLOY_USERNAME))
    this.store.setEmptyTransaction(username.includes(EMPTY_TRANSACTION_USERNAME))

    return new HttpResponse({
      status: 200,
      body: { account },
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
          timeout: 60000,
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
    const { challengeId, credential } = body;

    const pendingChallenge = this.store.consumeChallenge(challengeId);
    if (!pendingChallenge) {
      return new HttpResponse({
        status: 400,
        body: { error: { message: 'Invalid or expired challenge' } },
      });
    }

    if (pendingChallenge.type !== 'authentication') {
      return new HttpResponse({
        status: 400,
        body: { error: { message: 'Challenge type mismatch' } },
      });
    }

    if (pendingChallenge.expiresAt < Date.now()) {
      return new HttpResponse({
        status: 400,
        body: { error: { message: 'Challenge expired' } },
      });
    }

    // For username-less flow, use userHandle to find the credential
    const userHandle = credential.response.userHandle;
    if (!userHandle) {
      return new HttpResponse({
        status: 401,
        body: { error: { message: 'No userHandle in credential response' } },
      });
    }

    const userId = WebauthnUserHandleDecoder.decodeToUuid(userHandle);
    const storedCredential = this.store.findCredentialByUserId(userId);
    if (!storedCredential) {
      return new HttpResponse({
        status: 401,
        body: { error: { message: 'Invalid credential' } },
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
