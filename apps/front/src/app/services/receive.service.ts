import {inject, Injectable, signal} from '@angular/core';
import {NotificationService} from './notification.service';
import {ReceiveHttpService, ReceiveNetwork, ReceiveResponse} from './receive.http.service';

@Injectable({
  providedIn: 'root',
})
export class ReceiveService {
  private readonly httpService = inject(ReceiveHttpService);
  private readonly notificationService = inject(NotificationService);

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
