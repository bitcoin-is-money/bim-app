import {inject, Injectable, signal} from '@angular/core';
import {Router} from '@angular/router';
import {ParsedPayment} from '../model';
import {PaymentHttpService} from './payment.http.service';


@Injectable({
  providedIn: 'root',
})
export class PaymentService {
  private readonly httpService: PaymentHttpService = inject(PaymentHttpService);
  private readonly router: Router = inject(Router);
  parsedPayment = signal<ParsedPayment | null>(null);
  isLoading = signal(false);

  parseAndNavigate(data: string): void {
    this.isLoading.set(true);
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
}
