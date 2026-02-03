import {HttpClient} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import {Observable} from 'rxjs';

export type PaymentNetwork = 'lightning' | 'bitcoin' | 'starknet';

export type ParsePaymentResponse =
  | {
      network: 'lightning';
      amount: { value: number; currency: 'SAT' };
      fee: { value: number; currency: 'SAT' };
      description: string;
      invoice: string;
      expiresAt?: string;
    }
  | {
      network: 'bitcoin';
      amount: { value: number; currency: 'SAT' };
      fee: { value: number; currency: 'SAT' };
      description: string;
      address: string;
    }
  | {
      network: 'starknet';
      amount: { value: number; currency: 'SAT' };
      fee: { value: number; currency: 'SAT' };
      description: string;
      address: string;
      tokenAddress: string;
    };

export type ExecutePaymentResponse =
  | {
      network: 'starknet';
      txHash: string;
      amount: { value: number; currency: 'SAT' };
      feeAmount: { value: number; currency: 'SAT' };
      recipientAddress: string;
      tokenAddress: string;
    }
  | {
      network: 'lightning';
      txHash: string;
      amount: { value: number; currency: 'SAT' };
      swapId: string;
      invoice: string;
      expiresAt: string;
    }
  | {
      network: 'bitcoin';
      txHash: string;
      amount: { value: number; currency: 'SAT' };
      swapId: string;
      destinationAddress: string;
      expiresAt: string;
    };

@Injectable({
  providedIn: 'root',
})
export class PayHttpService {
  private readonly apiUrl = '/api/payment/pay';
  private readonly http = inject(HttpClient);

  parse(data: string): Observable<ParsePaymentResponse> {
    return this.http.post<ParsePaymentResponse>(`${this.apiUrl}/parse`, {data});
  }

  execute(data: string): Observable<ExecutePaymentResponse> {
    return this.http.post<ExecutePaymentResponse>(`${this.apiUrl}/execute`, {data});
  }
}
