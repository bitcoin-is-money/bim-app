import {inject, Injectable, signal} from '@angular/core';
import {Router} from '@angular/router';
import {ParsedPayment, type StoredSwap} from '../model';
import {NotificationService} from './notification.service';
import {PayHttpService} from './pay.http.service';
import {SwapPollingService} from './swap-polling.service';
import {SwapStorageService} from './swap-storage.service';

@Injectable({
  providedIn: 'root',
})
export class PayService {
  private readonly httpService = inject(PayHttpService);
  private readonly router = inject(Router);
  private readonly notificationService = inject(NotificationService);
  private readonly swapStorageService = inject(SwapStorageService);
  private readonly swapPollingService = inject(SwapPollingService);

  parsedPayment = signal<ParsedPayment | null>(null);
  isLoading = signal(false);
  isProcessing = signal(false);

  private rawData: string | null = null;

  parseAndNavigate(data: string): void {
    this.isLoading.set(true);
    this.rawData = data;
    this.httpService.parse(data).subscribe({
      next: (response) => {
        this.parsedPayment.set(ParsedPayment.fromResponse(response));
        this.isLoading.set(false);
        this.router.navigate(['/pay/confirm']);
      },
      error: () => {
        this.isLoading.set(false);
      },
    });
  }

  executeAndNavigate(): void {
    if (!this.rawData) return;
    this.isProcessing.set(true);
    this.httpService.execute(this.rawData).subscribe({
      next: (response) => {
        this.isProcessing.set(false);
        this.parsedPayment.set(null);
        this.rawData = null;

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
        this.notificationService.error({message: 'Payment failed'});
      },
    });
  }
}
