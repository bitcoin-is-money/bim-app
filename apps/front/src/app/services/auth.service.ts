import {HttpErrorResponse} from '@angular/common/http';
import {inject, Injectable, signal} from '@angular/core';
import {Router} from '@angular/router';
import {Base64Url, UuidCodec} from "@bim/lib/encoding";
import type {Observable} from 'rxjs';
import {catchError, firstValueFrom, map} from 'rxjs';
import type {Account} from "../model";
import type {AuthResponse, BeginAuthResponse, BeginRegisterResponse, UserSessionResponse} from './auth.http.service';
import {AuthHttpService} from './auth.http.service';
import {CurrencyService} from './currency.service';
import {I18nService} from './i18n.service';
import {NotificationService} from './notification.service';
import {PwaUpdateService} from './pwa-update.service';

export type {AuthResponse, BeginAuthResponse, BeginRegisterResponse, UserSessionResponse} from './auth.http.service';

/**
 * Budget (ms) for `PwaUpdateService.hasUpdate()` at login / session resume.
 * Short enough to avoid stalling navigation, long enough to let the SW
 * answer on mobile networks.
 */
const UPDATE_CHECK_BUDGET_MS = 2000;

/**
 * Session loading is handled by provideAppInitializer in app.config.ts
 * to ensure it completes before route guards run.
 */
@Injectable({
  providedIn: 'root',
})
export class AuthService {

  private readonly httpService = inject(AuthHttpService);
  private readonly router = inject(Router);
  private readonly i18n = inject(I18nService);
  private readonly currency = inject(CurrencyService);
  private readonly notifications = inject(NotificationService);
  private readonly pwaUpdate = inject(PwaUpdateService);

  currentUser = signal<Account | null>(null);
  isLoading = signal(false);
  isNewUser = signal(false);

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
      this.notifications.error({ message: this.i18n.t('notifications.usernameTooShort') });
      return;
    }

    this.isLoading.set(true);
    try {
      const beginResponse = await firstValueFrom(this.httpService.beginRegister(username));

      const options = this.convertRegistrationOptions(beginResponse.options);
      const credential = await navigator.credentials.create({ publicKey: options }) as PublicKeyCredential | null;

      if (!credential) {
        this.notifications.error({ message: this.i18n.t('notifications.registrationCancelled') });
        return;
      }

      await firstValueFrom(this.completeRegister(
        beginResponse.challengeId,
        beginResponse.accountId,
        username,
        credential
      ));

      this.isNewUser.set(true);
      await this.currency.init();
      await this.router.navigate(['/account-setup']);
    } catch (error) {
      // HTTP errors are already handled by the interceptor
      // Only handle non-HTTP errors here
      if (!(error instanceof HttpErrorResponse)) {
        const message = error instanceof Error ? error.message : this.i18n.t('notifications.registrationFailed');
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
        this.notifications.error({ message: this.i18n.t('notifications.authenticationCancelled') });
        return;
      }

      await firstValueFrom(this.completeLogin(beginResponse.challengeId, credential));

      // Load user preferences after login
      await this.i18n.init();
      await this.currency.init();

      await this.navigateAfterSignIn();
    } catch (error) {
      this.handleSignInError(error);
    } finally {
      this.isLoading.set(false);
    }
  }

  private async navigateAfterSignIn(): Promise<void> {
    const route = await this.pwaUpdate.hasUpdate(UPDATE_CHECK_BUDGET_MS) ? '/updating' : '/home';
    await this.router.navigate([route]);
  }

  private handleSignInError(error: unknown): void {
    // HTTP errors are already handled by the interceptor
    if (error instanceof HttpErrorResponse) return;

    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      this.notifications.error({ message: this.i18n.t('notifications.authenticationCancelled') });
      return;
    }

    const message = error instanceof Error ? error.message : this.i18n.t('notifications.authenticationFailed');
    this.notifications.error({ message });
  }

  /**
   * Updates the Starknet address on the current user signal.
   * Called after account deployment when the address becomes known.
   */
  updateStarknetAddress(address: string): void {
    this.currentUser.update(user => user ? {...user, starknetAddress: address} : null);
  }

  /**
   * Logs out the current user and navigates to the auth page.
   */
  async signOut(): Promise<void> {
    await firstValueFrom(this.httpService.logout());
    this.currentUser.set(null);
    this.currency.stop();
    // Reset to browser language after logout
    await this.i18n.initFromBrowser();
    await this.router.navigate(['/auth']);
  }

  async loadCurrentUser(): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.httpService.getSession().pipe(
          catchError(() => [{ authenticated: false } as UserSessionResponse])
        )
      );
      if (response.authenticated && response.account) {
        this.currentUser.set(response.account);
        await this.i18n.init();
        await this.currency.init();
        if (await this.pwaUpdate.hasUpdate(UPDATE_CHECK_BUDGET_MS)) {
          await this.router.navigate(['/updating']);
        }
      } else {
        this.currentUser.set(null);
        await this.i18n.initFromBrowser();
      }
    } catch {
      this.currentUser.set(null);
      await this.i18n.initFromBrowser();
    }
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

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
      timeout: options.timeoutMs,
      userVerification: (options.userVerification ?? 'required') as UserVerificationRequirement,
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
      timeout: options.timeoutMs,
      attestation: 'none',
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'required'
      },
    } as PublicKeyCredentialCreationOptions;
  }
}
