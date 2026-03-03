import {inject, Injectable, signal} from '@angular/core';
import {Router} from '@angular/router';
import {Base64Url} from '@bim/lib/encoding';
import {firstValueFrom} from 'rxjs';
import {ParsedPayment, type StoredSwap} from '../model';
import {type BuildPaymentResponse, type ExecutePaymentResponse, type PaymentNetwork, PayHttpService} from './pay.http.service';
import {SwapPollingService} from './swap-polling.service';
import {SwapStorageService} from './swap-storage.service';

@Injectable({
  providedIn: 'root',
})
export class PayService {
  private readonly httpService = inject(PayHttpService);
  private readonly router = inject(Router);
  private readonly swapStorageService = inject(SwapStorageService);
  private readonly swapPollingService = inject(SwapPollingService);

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

  parseAndNavigate(data: string): void {
    this.isLoading.set(true);
    this.rawData = data;
    this.cachedBuild = null;
    this.parsedPayment.set(null);

    // 1. Parse: fast decode → display payment details immediately
    this.httpService.parse(data).subscribe({
      next: (parseResponse) => {
        const payment = ParsedPayment.fromResponse(parseResponse);
        this.parsedPayment.set(payment);
        this.description = payment.description || null;
        this.isLoading.set(false);
        void this.router.navigate(['/pay/confirm']);

        // 2. Build: get real fee from LP quote in background
        this.isBuilding.set(true);
        this.httpService.build(data).subscribe({
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
      },
    });
  }

  setDescription(value: string): void {
    const newDescription = value || null;
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
      // HTTP errors are handled by the interceptor
    } finally {
      this.isProcessing.set(false);
    }
  }

  private handleSuccess(response: ExecutePaymentResponse): void {
    this.parsedPayment.set(null);
    this.rawData = null;
    this.description = null;
    this.cachedBuild = null;
    this.isBuilding.set(false);
    this.lastPaymentNetwork.set(response.network);

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
    }

    void this.router.navigate(['/pay/success']);
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
    bytes[i] = parseInt(padded.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
