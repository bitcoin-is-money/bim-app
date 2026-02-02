import {inject, Injectable, signal} from '@angular/core';
import {Router} from '@angular/router';
import {ParsedPayment} from '../model';
import {NotificationService} from './notification.service';
import {PaymentHttpService} from './payment.http.service';


@Injectable({
  providedIn: 'root',
})
export class PaymentService {
  private readonly httpService: PaymentHttpService = inject(PaymentHttpService);
  private readonly router: Router = inject(Router);
  private readonly notificationService: NotificationService = inject(NotificationService);

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
      next: () => {
        this.isProcessing.set(false);
        this.parsedPayment.set(null);
        this.rawData = null;
        this.router.navigate(['/pay/success']);
      },
      error: () => {
        this.isProcessing.set(false);
        this.notificationService.error({message: 'Payment failed'});
      },
    });
  }
}
