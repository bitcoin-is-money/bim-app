import {HttpClient} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import {Observable} from 'rxjs';
import type {SwapStatusResponse} from '../model';

@Injectable({
  providedIn: 'root',
})
export class SwapHttpService {
  private readonly apiUrl = '/api/swap';
  private readonly http = inject(HttpClient);

  getStatus(swapId: string): Observable<SwapStatusResponse> {
    return this.http.get<SwapStatusResponse>(`${this.apiUrl}/status/${swapId}`);
  }
}
