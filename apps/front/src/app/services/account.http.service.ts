import {HttpClient} from '@angular/common/http';
import {Injectable} from '@angular/core';
import {Observable} from 'rxjs';
import type {Currency} from "../model";

export interface DeploymentStatusResponse {
  status: 'pending' | 'deploying' | 'deployed' | 'failed';
}

export interface BalanceResponse {
  amount: number;
  currency: Currency;
}

@Injectable({
  providedIn: 'root',
})
export class AccountHttpService {
  constructor(
    private readonly http: HttpClient
  ) {
  }

  getBalance(): Observable<BalanceResponse> {
    return this.http.get<BalanceResponse>('/api/account/balance');
  }

  getDeploymentStatus(): Observable<DeploymentStatusResponse> {
    return this.http.get<DeploymentStatusResponse>('/api/account/deployment-status');
  }

}
