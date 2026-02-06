import {inject, Injectable, signal} from '@angular/core';
import type {StoredSwap} from '../model';
import {NotificationService} from './notification.service';
import {ReceiveHttpService, ReceiveNetwork, ReceiveResponse} from './receive.http.service';
import {SwapPollingService} from './swap-polling.service';
import {SwapStorageService} from './swap-storage.service';

@Injectable({
  providedIn: 'root',
})
export class ReceiveService {
  private readonly httpService = inject(ReceiveHttpService);
  private readonly notificationService = inject(NotificationService);
  private readonly swapStorageService = inject(SwapStorageService);
  private readonly swapPollingService = inject(SwapPollingService);

  readonly isLoading = signal(false);
  readonly invoice = signal<ReceiveResponse | null>(null);

  createInvoice(network: ReceiveNetwork, amount: number): void {
    this.isLoading.set(true);
    this.invoice.set(null);

    this.httpService.createInvoice({network, amount}).subscribe({
      next: (response) => {
        this.invoice.set(response);
        this.isLoading.set(false);
        this.notificationService.success({message: 'Invoice created'});

        if (response.network !== 'starknet' && 'swapId' in response) {
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
      },
      error: () => {
        this.isLoading.set(false);
        this.notificationService.error({message: 'Invoice creation failed'});
      },
    });
  }

  reset(): void {
    this.invoice.set(null);
    this.isLoading.set(false);
  }
}
