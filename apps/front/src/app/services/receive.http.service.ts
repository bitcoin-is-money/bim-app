import {HttpClient} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import type {Observable} from 'rxjs';

export type ReceiveNetwork = 'lightning' | 'bitcoin' | 'starknet';

export interface CreateInvoiceRequest {
  network: ReceiveNetwork;
  amount: number;
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

export interface BitcoinReceivePendingCommitResponse {
  network: 'bitcoin';
  status: 'pending_commit';
  buildId: string;
  messageHash: string;
  credentialId: string;
  swapId: string;
  amount: { value: number; currency: string };
  expiresAt: string;
}

export type BitcoinReceiveCommitResponse = BitcoinReceiveResponse;

export interface WebAuthnAssertion {
  authenticatorData: string;
  clientDataJSON: string;
  signature: string;
}

export type ReceiveResponse =
  | StarknetReceiveResponse
  | LightningReceiveResponse
  | BitcoinReceiveResponse
  | BitcoinReceivePendingCommitResponse;

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
      ...(request.description ? {description: request.description} : {}),
      ...(request.useUriPrefix === undefined ? {} : {useUriPrefix: request.useUriPrefix}),
    });
  }

  commitBitcoinReceive(buildId: string, assertion: WebAuthnAssertion): Observable<BitcoinReceiveCommitResponse> {
    return this.http.post<BitcoinReceiveCommitResponse>(`${this.apiUrl}/commit`, {
      buildId,
      assertion,
    });
  }
}
