import {HttpClient, HttpContext} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import type {Observable} from 'rxjs';
import {SUPPRESS_ERROR_NOTIFICATION} from '../interceptor/http-notification.interceptor';
import type {SwapStatusResponse} from '../model';

@Injectable({
  providedIn: 'root',
})
export class SwapHttpService {
  private readonly apiUrl = '/api/swap';
  private readonly http = inject(HttpClient);

  getStatus(swapId: string, options?: { silent?: boolean }): Observable<SwapStatusResponse> {
    const url = `${this.apiUrl}/status/${swapId}`;
    if (options?.silent) {
      return this.http.get<SwapStatusResponse>(url, {
        context: new HttpContext().set(SUPPRESS_ERROR_NOTIFICATION, true),
      });
    }
    return this.http.get<SwapStatusResponse>(url);
  }
}
