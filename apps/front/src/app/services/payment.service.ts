import {Injectable, signal} from '@angular/core';
import {Router} from '@angular/router';
import {PaymentHttpService, ParsePaymentResponse} from './payment.http.service';


@Injectable({
  providedIn: 'root',
})
export class PaymentService {
  parsedPayment = signal<ParsePaymentResponse | null>(null);
  isLoading = signal(false);

  constructor(
    private readonly httpService: PaymentHttpService,
    private readonly router: Router,
  ) {}

  parseAndNavigate(data: string): void {
    this.isLoading.set(true);
    this.httpService.parse(data).subscribe({
      next: (response) => {
        this.parsedPayment.set(response);
        this.isLoading.set(false);
        this.router.navigate(['/pay/confirm']);
      },
      error: () => {
        this.isLoading.set(false);
      },
    });
  }
}
