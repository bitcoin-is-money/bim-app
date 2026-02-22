import {HttpClient} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import {Observable} from 'rxjs';

export type ReceiveNetwork = 'lightning' | 'bitcoin' | 'starknet';

export interface CreateInvoiceRequest {
  network: ReceiveNetwork;
  amount: number;
  tokenAddress?: string;
  description?: string;
  useUriPrefix?: boolean;
}

export interface StarknetReceiveResponse {
  network: 'starknet';
  address: string;
  uri: string;
}

export interface LightningReceiveResponse {
  network: 'lightning';
  swapId: string;
  invoice: string;
  amount: { value: number; currency: string };
  expiresAt: string;
}

export interface BitcoinReceiveResponse {
  network: 'bitcoin';
  swapId: string;
  depositAddress: string;
  bip21Uri: string;
  amount: { value: number; currency: string };
  expiresAt: string;
}

export type ReceiveResponse =
  | StarknetReceiveResponse
  | LightningReceiveResponse
  | BitcoinReceiveResponse;

@Injectable({
  providedIn: 'root',
})
export class ReceiveHttpService {
  private readonly apiUrl = '/api/payment/receive';
  private readonly http = inject(HttpClient);

  createInvoice(request: CreateInvoiceRequest): Observable<ReceiveResponse> {
    return this.http.post<ReceiveResponse>(this.apiUrl, {
      network: request.network,
      amount: String(request.amount),
      tokenAddress: request.tokenAddress,
      ...(request.description ? {description: request.description} : {}),
      ...(request.useUriPrefix !== undefined ? {useUriPrefix: request.useUriPrefix} : {}),
    });
  }
}
