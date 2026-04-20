import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';
import type { Account } from '../model';

export interface AuthResponse {
  account: Account;
}

export interface BeginAuthResponse {
  options: {
    challenge: string;
    rpId: string;
    allowCredentials?: { id: string; type: string }[];
    timeoutMs: number;
    userVerification?: string;
  };
  challengeId: string;
}

export interface BeginRegisterResponse {
  options: {
    challenge: string;
    rpId: string;
    rpName: string;
    userId: string;
    userName: string;
    timeoutMs: number;
  };
  challengeId: string;
  accountId: string; // Pre-generated account ID - must be passed to completeRegister
}

export interface UserSessionResponse {
  authenticated: boolean;
  account?: Account;
}

@Injectable({
  providedIn: 'root',
})
export class AuthHttpService {
  private readonly apiUrl = '/api/auth';
  private readonly http = inject(HttpClient);

  beginRegister(username: string): Observable<BeginRegisterResponse> {
    return this.http.post<BeginRegisterResponse>(`${this.apiUrl}/register/begin`, { username });
  }

  completeRegister(body: {
    challengeId: string;
    accountId: string;
    username: string;
    credential: unknown;
  }): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/register/complete`, body);
  }

  beginLogin(): Observable<BeginAuthResponse> {
    return this.http.post<BeginAuthResponse>(`${this.apiUrl}/login/begin`, {});
  }

  completeLogin(body: { challengeId: string; credential: unknown }): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/login/complete`, body);
  }

  getSession(): Observable<UserSessionResponse> {
    return this.http.get<UserSessionResponse>(`${this.apiUrl}/session`);
  }

  logout(): Observable<undefined> {
    return this.http.post<undefined>(`${this.apiUrl}/logout`, {});
  }
}
