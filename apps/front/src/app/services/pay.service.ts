import {inject, Injectable, signal} from '@angular/core';
import {Router} from '@angular/router';
import {ParsedPayment, type StoredSwap} from '../model';
import {PayHttpService} from './pay.http.service';
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
  isProcessing = signal(false);

  /** Original payment payload (invoice, BIP21 URI, Starknet URI, or raw address) kept for the execute call. */
  private rawData: string | null = null;
  private description: string | null = null;

  parseAndNavigate(data: string): void {
    this.isLoading.set(true);
    this.rawData = data;
    this.httpService.parse(data).subscribe({
      next: (response) => {
        const payment = ParsedPayment.fromResponse(response);
        this.parsedPayment.set(payment);
        this.description = payment.description || null;
        this.isLoading.set(false);
        this.router.navigate(['/pay/confirm']);
      },
      error: () => {
        this.isLoading.set(false);
      },
    });
  }

  setDescription(value: string): void {
    this.description = value || null;
  }

  executeAndNavigate(): void {
    if (!this.rawData) return;
    this.isProcessing.set(true);
    this.httpService
      .execute(this.rawData, this.description ?? undefined)
      .subscribe({
        next: (response) => {
          this.isProcessing.set(false);
          this.parsedPayment.set(null);
          this.rawData = null;
          this.description = null;

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

          this.router.navigate(['/pay/success']);
        },
        error: () => {
          this.isProcessing.set(false);
          // Error notification is handled by the HTTP interceptor
        },
      });
  }
}
