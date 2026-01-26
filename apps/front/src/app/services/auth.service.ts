import {HttpClient} from '@angular/common/http';
import {Injectable, signal} from '@angular/core';
import {BufferUtils} from "@bim/lib/BufferUtils";
import {catchError, map, Observable} from 'rxjs';
import {environment} from '../../environments/environment';

export interface Account {
  id: string;
  username: string;
  starknetAddress: string;
  status: string;
}

export interface AuthResponse {
  account: Account;
}

export interface BeginAuthResponse {
  options: {
    challenge: string;
    rpId: string;
    allowCredentials?: Array<{ id: string; type: string }>;
    timeout?: number;
    userVerification?: string;
  };
  challengeId: string;
}

export interface BeginRegisterResponse {
  options: {
    challenge: string;
    rpId: string;
    rpName: string;
    userId: string;
    userName: string;
    timeout?: number;
  };
  challengeId: string;
  accountId: string; // Pre-generated account ID - must be passed to completeRegister
}

export interface UserSessionResponse {
  authenticated: boolean;
  account?: Account
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly apiUrl = '/api/auth';
  currentUser = signal<Account | null>(null);

  constructor(private readonly http: HttpClient) {
    this.loadCurrentUser();
  }

  loadCurrentUser(): void {
    this.http
      .get<UserSessionResponse>(`${this.apiUrl}/session`)
      .pipe(
        catchError(() => {
          return [{ authenticated: false }];
        })
      )
      .subscribe((response: UserSessionResponse) => {
        if (response.authenticated && response.account) {
          this.currentUser.set(response.account);
        } else {
          this.currentUser.set(null);
        }
      });
  }

  beginLogin(): Observable<BeginAuthResponse> {
    return this.http.post<BeginAuthResponse>(`${this.apiUrl}/login/begin`, {});
  }

  beginRegister(username: string): Observable<BeginRegisterResponse> {
    return this.http.post<BeginRegisterResponse>(`${this.apiUrl}/register/begin`, {
      username,
    });
  }

  completeLogin(challengeId: string, credential: PublicKeyCredential): Observable<AuthResponse> {
    const credentialJson = this.credentialToJson(credential);
    return this.http.post<AuthResponse>(`${this.apiUrl}/login/complete`, {
      challengeId,
      credential: credentialJson,
    }).pipe(
      map((response) => {
        this.currentUser.set(response.account);
        return response;
      })
    );
  }

  completeRegister(
    challengeId: string,
    accountId: string,
    username: string,
    credential: PublicKeyCredential
  ): Observable<AuthResponse> {
    const credentialJson = this.credentialToJson(credential);
    return this.http.post<AuthResponse>(`${this.apiUrl}/register/complete`, {
      challengeId,
      accountId,
      username,
      credential: credentialJson,
    }).pipe(
      map((response) => {
        this.currentUser.set(response.account);
        return response;
      })
    );
  }

  logout(): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/logout`, {}).pipe(
      map(() => {
        this.currentUser.set(null);
      })
    );
  }

  private credentialToJson(credential: PublicKeyCredential): any {
    const response = credential.response as AuthenticatorAssertionResponse | AuthenticatorAttestationResponse;

    if ('attestationObject' in response) {
      // Registration
      return {
        id: BufferUtils.bufferToBase64Url(credential.rawId),
        rawId: BufferUtils.bufferToBase64Url(credential.rawId),
        response: {
          clientDataJSON: BufferUtils.bufferToBase64Url(response.clientDataJSON),
          attestationObject: BufferUtils.bufferToBase64Url(response.attestationObject),
        },
        type: credential.type,
      };
    } else {
      // Authentication
      return {
        id: BufferUtils.bufferToBase64Url(credential.rawId),
        rawId: BufferUtils.bufferToBase64Url(credential.rawId),
        response: {
          clientDataJSON: BufferUtils.bufferToBase64Url(response.clientDataJSON),
          authenticatorData: BufferUtils.bufferToBase64Url(response.authenticatorData),
          signature: BufferUtils.bufferToBase64Url(response.signature),
          userHandle: response.userHandle ? BufferUtils.bufferToBase64Url(response.userHandle) : undefined,
        },
        type: credential.type,
      };
    }
  }

  convertAuthOptions(options: BeginAuthResponse['options']): PublicKeyCredentialRequestOptions {
    return {
      challenge: BufferUtils.base64UrlToUint8Array(options.challenge),
      rpId: options.rpId,
      allowCredentials: options.allowCredentials?.map((cred) => ({
        id: BufferUtils.base64UrlToUint8Array(cred.id),
        type: cred.type as PublicKeyCredentialType,
      })),
      timeout: options.timeout || 60000,
      userVerification: (options.userVerification as UserVerificationRequirement) || 'required',
    } as PublicKeyCredentialRequestOptions;
  }

  convertRegistrationOptions(options: BeginRegisterResponse['options']): PublicKeyCredentialCreationOptions {
    // In production, require platform authenticator (TouchID, FaceID, fingerprint)
    // In development, allow any authenticator (including security keys) for testing
    // residentKey: 'required' enables discoverable credentials for usernameless login
    const authenticatorSelection: AuthenticatorSelectionCriteria = environment.production
      ? { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'required' }
      : { userVerification: 'preferred', residentKey: 'required' };

    return {
      challenge: BufferUtils.base64UrlToUint8Array(options.challenge),
      rp: {
        id: options.rpId,
        name: options.rpName,
      },
      user: {
        id: BufferUtils.uuidToBytes(options.userId),
        name: options.userName,
        displayName: options.userName,
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' }, // ES256
        { alg: -257, type: 'public-key' }, // RS256
      ],
      timeout: options.timeout || 60000,
      attestation: 'none',
      authenticatorSelection,
    } as PublicKeyCredentialCreationOptions;
  }

}
