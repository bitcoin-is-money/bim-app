import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

export interface DonationBuildResponse {
  buildId: string;
  messageHash: string;
  credentialId: string;
}

@Injectable({
  providedIn: 'root',
})
export class DonationHttpService {
  private readonly apiUrl = '/api/payment/donation';
  private readonly http = inject(HttpClient);

  build(amountSats: number): Observable<DonationBuildResponse> {
    return this.http.post<DonationBuildResponse>(`${this.apiUrl}/build`, { amountSats });
  }
}
