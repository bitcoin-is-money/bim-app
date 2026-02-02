import {HttpClient} from '@angular/common/http';
import {Injectable} from '@angular/core';
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

@Injectable({
  providedIn: 'root',
})
export class PaymentHttpService {
  private readonly apiUrl = '/api/pay';

  constructor(private readonly http: HttpClient) {}

  parse(data: string): Observable<ParsePaymentResponse> {
    return this.http.post<ParsePaymentResponse>(`${this.apiUrl}/parse`, {data});
  }
}
