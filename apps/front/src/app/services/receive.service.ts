import {inject, Injectable, signal} from '@angular/core';
import {Base64Url} from '@bim/lib/encoding';
import {firstValueFrom} from 'rxjs';
import type {StoredSwap} from '../model';
import {I18nService} from './i18n.service';
import {NotificationService} from './notification.service';
import {
  type BitcoinReceivePendingCommitResponse,
  type CreateInvoiceRequest,
  ReceiveHttpService,
  type ReceiveNetwork,
  type ReceiveResponse,
} from './receive.http.service';
import {SwapPollingService} from './swap-polling.service';
import {SwapStorageService} from './swap-storage.service';
import {TransactionService} from './transaction.service';

const I18N_READY_KEYS: Record<ReceiveNetwork, string> = {
  lightning: 'notifications.receive.lightning.ready',
  bitcoin: 'notifications.receive.bitcoin.ready',
  starknet: 'notifications.receive.starknet.ready',
};

// Starknet receives have no swap to poll; watch the transactions endpoint for
// up to 1 minute for an incoming WBTC transfer indexed by Apibara.
const STARKNET_WATCH_INTERVAL_MS = 2000;
const STARKNET_WATCH_MAX_ATTEMPTS = 30;

@Injectable({
  providedIn: 'root',
})
export class ReceiveService {
  private readonly httpService = inject(ReceiveHttpService);
  private readonly notificationService = inject(NotificationService);
  private readonly i18n = inject(I18nService);
  private readonly swapStorageService = inject(SwapStorageService);
  private readonly swapPollingService = inject(SwapPollingService);
  private readonly transactionService = inject(TransactionService);

  readonly isLoading = signal(false);
  readonly invoice = signal<ReceiveResponse | null>(null);

  createInvoice(network: ReceiveNetwork, amount: number, description?: string, useUriPrefix?: boolean): void {
    this.isLoading.set(true);
    this.invoice.set(null);
    const request: CreateInvoiceRequest = {
      network,
      amount,
      ...(description ? {description} : {}),
      ...(useUriPrefix !== undefined ? {useUriPrefix} : {})
    };
    this.httpService.createInvoice(request).subscribe({
      next: (response) => {
        // Bitcoin two-phase flow: need WebAuthn signing before deposit address is available
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive: guard against future ReceiveResult variants
        if (response.network === 'bitcoin' && 'status' in response && response.status === 'pending_commit') {
          void this.handleBitcoinCommitFlow(response);
          return;
        }

        this.handleReceiveSuccess(response);
      },
      error: () => {
        this.isLoading.set(false);
        // Error notification is handled by the HTTP interceptor
      },
    });
  }

  reset(): void {
    this.invoice.set(null);
    this.isLoading.set(false);
  }

  /**
   * Handles the Bitcoin two-phase commit flow:
   * 1. Sign commit transaction with WebAuthn (biometrics)
   * 2. Submit signed commit to backend
   * 3. Backend waits for Starknet confirmation, returns deposit address
   */
  private async handleBitcoinCommitFlow(pendingCommit: BitcoinReceivePendingCommitResponse): Promise<void> {
    try {
      // 1. WebAuthn sign (user approves commit with biometrics)
      const challenge = hexToBytes(pendingCommit.messageHash).buffer as ArrayBuffer;
      const credentialIdBytes = Base64Url.decode(pendingCommit.credentialId).buffer as ArrayBuffer;
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
        this.isLoading.set(false);
        return;
      }

      // 2. Encode assertion
      const assertionResponse = credential.response as AuthenticatorAssertionResponse;
      const assertion = {
        authenticatorData: Base64Url.encode(assertionResponse.authenticatorData),
        clientDataJSON: Base64Url.encode(assertionResponse.clientDataJSON),
        signature: Base64Url.encode(assertionResponse.signature),
      };

      // 3. Submit commit to backend (this waits for Starknet confirmation)
      const response = await firstValueFrom(
        this.httpService.commitBitcoinReceive(pendingCommit.buildId, assertion),
      );

      this.handleReceiveSuccess(response);
    } catch {
      this.isLoading.set(false);
      // Error notification is handled by the HTTP interceptor
    }
  }

  private handleReceiveSuccess(response: ReceiveResponse): void {
    this.invoice.set(response);
    this.isLoading.set(false);
     
    const readyKey = I18N_READY_KEYS[response.network];
    this.notificationService.success({message: this.i18n.t(readyKey)});

    if (response.network === 'starknet') {
      // No swap is created for Starknet receives — watch the transactions
      // endpoint (fed by the Apibara indexer) for the incoming WBTC transfer.
      this.transactionService.waitForNew({
        intervalMs: STARKNET_WATCH_INTERVAL_MS,
        maxAttempts: STARKNET_WATCH_MAX_ATTEMPTS,
        onDetected: () => {
          this.notificationService.info({
            message: this.i18n.t('notifications.receive.starknet.paid'),
          });
        },
      });
      return;
    }

    if ('swapId' in response) {
      const swap: StoredSwap = {
        id: response.swapId,
        type: 'receive',
        direction: response.network === 'lightning' ? 'lightning_to_starknet' : 'bitcoin_to_starknet',
        amountSats: response.amount.value,
        createdAt: new Date().toISOString(),
        lastKnownStatus: 'pending',
      };
      this.swapStorageService.saveSwap(swap);
      this.swapPollingService.startPolling(swap.id);
    }
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
