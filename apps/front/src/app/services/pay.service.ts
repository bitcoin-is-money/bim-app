import {inject, Injectable, signal} from '@angular/core';
import {Router} from '@angular/router';
import {Base64Url} from '@bim/lib/encoding';
import type { Subscription} from 'rxjs';
import {firstValueFrom} from 'rxjs';
import {ParsedPayment, type StoredSwap} from '../model';
import {AccountService} from './account.service';
import {I18nService} from './i18n.service';
import {NotificationService} from './notification.service';
import {
  type BuildPaymentResponse,
  type ExecutePaymentResponse,
  PayHttpService,
  type PaymentNetwork
} from './pay.http.service';
import {SwapPollingService} from './swap-polling.service';
import {SwapStorageService} from './swap-storage.service';
import {TransactionService} from './transaction.service';

const SENT_KEYS: Record<PaymentNetwork, string> = {
  lightning: 'notifications.send.lightning.sent',
  bitcoin: 'notifications.send.bitcoin.sent',
  starknet: 'notifications.send.starknet.sent',
};

@Injectable({
  providedIn: 'root',
})
export class PayService {
  private readonly httpService = inject(PayHttpService);
  private readonly router = inject(Router);
  private readonly accountService = inject(AccountService);
  private readonly transactionService = inject(TransactionService);
  private readonly swapStorageService = inject(SwapStorageService);
  private readonly swapPollingService = inject(SwapPollingService);
  private readonly notificationService = inject(NotificationService);
  private readonly i18n = inject(I18nService);

  parsedPayment = signal<ParsedPayment | null>(null);
  isLoading = signal(false);
  isBuilding = signal(false);
  isProcessing = signal(false);

  /** Network of the last executed payment (used by success page to distinguish instant vs swap). */
  lastPaymentNetwork = signal<PaymentNetwork | null>(null);

  /** Original payment payload (invoice, BIP21 URI, Starknet URI, or raw address) kept for the execute call. */
  private rawData: string | null = null;
  private description: string | null = null;
  private cachedBuild: BuildPaymentResponse | null = null;
  private flowSubscription: Subscription | null = null;

  parseAndNavigate(data: string): void {
    // Cancel any in-flight parse/build from a previous scan
    this.flowSubscription?.unsubscribe();
    this.isLoading.set(true);
    this.isBuilding.set(false);
    this.isProcessing.set(false);
    this.rawData = data;
    this.cachedBuild = null;
    this.parsedPayment.set(null);

    // Navigate to confirm page immediately (shows spinner while parsing)
    void this.router.navigate(['/pay/confirm']);

    // 1. Parse: fast decode → display payment details
    this.flowSubscription = this.httpService.parse(data).subscribe({
      next: (parseResponse) => {
        const payment = ParsedPayment.fromResponse(parseResponse);
        this.parsedPayment.set(payment);
        this.description = payment.description || null;
        this.isLoading.set(false);

        // When amount is editable (e.g. bare Bitcoin address), skip auto-build.
        // The user must enter an amount first; build will happen on confirm.
        if (payment.amountEditable) {
          return;
        }

        // 2. Build: get real fee from LP quote in background
        this.isBuilding.set(true);
        this.flowSubscription = this.httpService.build(data).subscribe({
          next: (buildResponse) => {
            this.cachedBuild = buildResponse;
            const updatedPayment = ParsedPayment.fromResponse(buildResponse.payment);
            this.parsedPayment.set(updatedPayment);
            this.isBuilding.set(false);
          },
          error: () => {
            this.isBuilding.set(false);
          },
        });
      },
      error: () => {
        this.isLoading.set(false);
        // Navigate back — error notification is shown by the interceptor
        void this.router.navigate(['/pay'], {replaceUrl: true});
      },
    });
  }

  /**
   * Updates the payment amount for amountEditable payments (e.g. bare Bitcoin address).
   * Reconstructs the rawData as a BIP-21 URI with the new amount.
   */
  updatePaymentAmount(destination: string, amountSats: number): void {
    const btcAmount = amountSats / 100_000_000;
    this.rawData = `bitcoin:${destination}?amount=${btcAmount}`;
    this.cachedBuild = null;
  }

  setDescription(value: string): void {
    const newDescription = value === '' ? null : value;
    if (newDescription !== this.description) {
      this.description = newDescription;
      this.cachedBuild = null;
    }
  }

  /**
   * Executes a payment using the WebAuthn flow:
   * 1. Build (if not cached): backend prepares calls + typed data, returns challenge
   * 2. Sign: user approves with biometrics (WebAuthn assertion)
   * 3. Execute: backend verifies signature + submits transaction
   */
  async executeAndNavigate(): Promise<void> {
    if (!this.rawData) return;
    this.isProcessing.set(true);

    try {
      // 1. Use cached build or re-build (if description changed)
      const buildResponse = this.cachedBuild
        ?? await firstValueFrom(this.httpService.build(this.rawData, this.description ?? undefined));

      // 2. WebAuthn sign (user approves with biometrics)
      const challenge = hexToBytes(buildResponse.messageHash).buffer as ArrayBuffer;
      const credentialIdBytes = Base64Url.decode(buildResponse.credentialId).buffer as ArrayBuffer;
      const credential = (await navigator.credentials.get({
        publicKey: {
          challenge,
          allowCredentials: [
            {
              id: credentialIdBytes,
              type: 'public-key',
            },
          ],
          userVerification: 'required',
          timeout: 60000,
        },
      })) as PublicKeyCredential | null;

      if (!credential) {
        // User cancelled WebAuthn prompt
        return;
      }

      // 3. Encode assertion for backend
      const assertionResponse = credential.response as AuthenticatorAssertionResponse;
      const assertion = {
        authenticatorData: Base64Url.encode(assertionResponse.authenticatorData),
        clientDataJSON: Base64Url.encode(assertionResponse.clientDataJSON),
        signature: Base64Url.encode(assertionResponse.signature),
      };

      // 4. Execute (send signed data to backend)
      const response = await firstValueFrom(
        this.httpService.executeSigned(buildResponse.buildId, assertion),
      );

      // 5. Handle success
      this.handleSuccess(response);
    } catch {
      // HTTP errors are handled by the interceptor.
      // Invalidate cached build so retry triggers a fresh /build call
      // (the server consumes the buildId even on failed execute).
      this.cachedBuild = null;
    } finally {
      this.isProcessing.set(false);
    }
  }

  private handleSuccess(response: ExecutePaymentResponse): void {
    this.lastPaymentNetwork.set(response.network);

     
    const sentKey = SENT_KEYS[response.network];
    this.notificationService.info({message: this.i18n.t(sentKey)});

    if (response.network !== 'starknet' && 'swapId' in response) {
      const swap: StoredSwap = {
        id: response.swapId,
        type: 'send',
        direction: response.network === 'lightning' ? 'starknet_to_lightning' : 'starknet_to_bitcoin',
        amountSats: response.amount.value,
        createdAt: new Date().toISOString(),
        lastKnownStatus: 'pending',
      };
      this.swapStorageService.saveSwap(swap);
      this.swapPollingService.startPolling(swap.id);
    } else {
      // Starknet direct transfers have no swap to track — poll for the on-chain transaction
      this.transactionService.waitForNew();
      this.accountService.loadBalance();
    }

    // Navigate first, then clean up the UI state to avoid skeleton flash on confirm page
    void this.router.navigate(['/pay/success']).then(() => {
      this.parsedPayment.set(null);
      this.rawData = null;
      this.description = null;
      this.cachedBuild = null;
      this.isBuilding.set(false);
    });
  }
}

/**
 * Converts a 0x-prefixed hex string to Uint8Array (for WebAuthn challenge).
 */
function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const padded = clean.length % 2 === 0 ? clean : '0' + clean;
  const bytes = new Uint8Array(padded.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    // eslint-disable-next-line security/detect-object-injection -- numeric index on Uint8Array
    bytes[i] = Number.parseInt(padded.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
