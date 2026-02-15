import {HttpErrorResponse} from '@angular/common/http';
import {inject, Injectable, signal} from '@angular/core';
import {Router} from '@angular/router';
import {Base64Url, UuidCodec} from "@bim/lib/encoding";
import {catchError, firstValueFrom, map, Observable} from 'rxjs';
import {Account} from "../model";
import {
  AuthHttpService,
  AuthResponse,
  BeginAuthResponse,
  BeginRegisterResponse,
  UserSessionResponse,
} from './auth.http.service';
import {I18nService} from './i18n.service';
import {NotificationService} from './notification.service';

export type {AuthResponse, BeginAuthResponse, BeginRegisterResponse, UserSessionResponse};

@Injectable({
  providedIn: 'root',
})
export class AuthService {

  private readonly httpService = inject(AuthHttpService);
  private readonly router = inject(Router);
  private readonly i18n = inject(I18nService);
  private readonly notifications = inject(NotificationService);

  currentUser = signal<Account | null>(null);
  isLoading = signal(false);
  isNewUser = signal(false);

  constructor() {
    this.loadCurrentUser();
  }

  // ===========================================================================
  // Public Methods (for components)
  // ===========================================================================

  /**
   * Handles the complete sign-up flow:
   * 1. Validates username
   * 2. Begins registration (gets WebAuthn challenge)
   * 3. Creates credential via WebAuthn
   * 4. Completes registration
   * 5. Navigates to the account-setup page
   *
   * HTTP errors are handled by the HTTP interceptor (notifications).
   * Other errors (validation, WebAuthn) are handled here.
   */
  async signUp(username: string): Promise<void> {
    if (this.isLoading()) return;

    if (!username || username.length < 3) {
      this.notifications.error({ message: 'Username must be at least 3 characters' });
      return;
    }

    this.isLoading.set(true);
    try {
      const beginResponse = await firstValueFrom(this.httpService.beginRegister(username));

      const options = this.convertRegistrationOptions(beginResponse.options);
      const credential = await navigator.credentials.create({ publicKey: options }) as PublicKeyCredential | null;

      if (!credential) {
        this.notifications.error({ message: 'Registration cancelled' });
        return;
      }

      await firstValueFrom(this.completeRegister(
        beginResponse.challengeId,
        beginResponse.accountId,
        username,
        credential
      ));

      this.isNewUser.set(true);
      await this.router.navigate(['/account-setup']);
    } catch (error) {
      // HTTP errors are already handled by the interceptor
      // Only handle non-HTTP errors here
      if (!(error instanceof HttpErrorResponse)) {
        const message = error instanceof Error ? error.message : 'Registration failed';
        this.notifications.error({ message });
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Handles the complete sign-in flow (username-less/discoverable credentials):
   * 1. Begins authentication (gets WebAuthn challenge)
   * 2. Gets credential via WebAuthn (user selects from available passkeys)
   * 3. Completes authentication
   * 4. Navigates to the home page on success
   *
   * HTTP errors are handled by the HTTP interceptor (notifications).
   * Other errors (WebAuthn) are handled here.
   */
  async signIn(): Promise<void> {
    if (this.isLoading()) return;

    this.isLoading.set(true);
    try {
      const beginResponse = await firstValueFrom(this.httpService.beginLogin());

      const options = this.convertAuthOptions(beginResponse.options);
      const credential = await navigator.credentials.get({ publicKey: options }) as PublicKeyCredential | null;

      if (!credential) {
        this.notifications.error({ message: 'Authentication cancelled' });
        return;
      }

      await firstValueFrom(this.completeLogin(beginResponse.challengeId, credential));

      // Load user's language preference after login
      await this.i18n.init();

      await this.router.navigate(['/home']);
    } catch (error) {
      // HTTP errors are already handled by the interceptor
      // Only handle non-HTTP errors here
      if (!(error instanceof HttpErrorResponse)) {
        const message = error instanceof Error ? error.message : 'Authentication failed';
        this.notifications.error({ message });
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Logs out the current user and navigates to the auth page.
   */
  async signOut(): Promise<void> {
    await firstValueFrom(this.httpService.logout());
    this.currentUser.set(null);
    // Reset to browser language after logout
    await this.i18n.initFromBrowser();
    await this.router.navigate(['/auth']);
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private loadCurrentUser(): void {
    this.httpService
      .getSession()
      .pipe(
        catchError(() => {
          return [{ authenticated: false }];
        })
      )
      .subscribe((response: UserSessionResponse) => {
        if (response.authenticated && response.account) {
          this.currentUser.set(response.account);
          // Load user's language preference
          this.i18n.init();
        } else {
          this.currentUser.set(null);
          // Use browser language for unauthenticated users
          this.i18n.initFromBrowser();
        }
      });
  }

  private completeLogin(challengeId: string, credential: PublicKeyCredential): Observable<AuthResponse> {
    const credentialJson = this.credentialToJson(credential);
    return this.httpService.completeLogin({
      challengeId,
      credential: credentialJson,
    }).pipe(
      map((response) => {
        this.currentUser.set(response.account);
        return response;
      })
    );
  }

  private completeRegister(
    challengeId: string,
    accountId: string,
    username: string,
    credential: PublicKeyCredential
  ): Observable<AuthResponse> {
    const credentialJson = this.credentialToJson(credential);
    return this.httpService.completeRegister({
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

  private credentialToJson(credential: PublicKeyCredential): unknown {
    const response = credential.response as AuthenticatorAssertionResponse | AuthenticatorAttestationResponse;

    if ('attestationObject' in response) {
      // Registration
      return {
        id: Base64Url.encode(credential.rawId),
        rawId: Base64Url.encode(credential.rawId),
        response: {
          clientDataJSON: Base64Url.encode(response.clientDataJSON),
          attestationObject: Base64Url.encode(response.attestationObject),
        },
        type: credential.type,
      };
    } else {
      // Authentication
      return {
        id: Base64Url.encode(credential.rawId),
        rawId: Base64Url.encode(credential.rawId),
        response: {
          clientDataJSON: Base64Url.encode(response.clientDataJSON),
          authenticatorData: Base64Url.encode(response.authenticatorData),
          signature: Base64Url.encode(response.signature),
          userHandle: response.userHandle ? Base64Url.encode(response.userHandle) : undefined,
        },
        type: credential.type,
      };
    }
  }

  private convertAuthOptions(options: BeginAuthResponse['options']): PublicKeyCredentialRequestOptions {
    return {
      challenge: Base64Url.decode(options.challenge),
      rpId: options.rpId,
      allowCredentials: options.allowCredentials?.map((cred) => ({
        id: Base64Url.decode(cred.id),
        type: cred.type as PublicKeyCredentialType,
      })),
      timeout: options.timeout || 60000,
      userVerification: (options.userVerification as UserVerificationRequirement) || 'required',
    } as PublicKeyCredentialRequestOptions;
  }

  private convertRegistrationOptions(options: BeginRegisterResponse['options']): PublicKeyCredentialCreationOptions {
    return {
      challenge: Base64Url.decode(options.challenge),
      rp: {
        id: options.rpId,
        name: options.rpName,
      },
      user: {
        id: UuidCodec.toBytes(options.userId),
        name: options.userName,
        displayName: options.userName,
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' }, // ES256
        { alg: -257, type: 'public-key' }, // RS256
      ],
      timeout: options.timeout || 60000,
      attestation: 'none',
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'required'
      },
    } as PublicKeyCredentialCreationOptions;
  }
}
