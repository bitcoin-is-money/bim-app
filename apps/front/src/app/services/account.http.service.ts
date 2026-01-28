import {HttpClient} from '@angular/common/http';
import {Injectable} from '@angular/core';
import {Observable} from 'rxjs';

export interface DeploymentStatusResponse {
  status: 'pending' | 'deploying' | 'deployed' | 'failed';
}

export interface DeployAccountResponse {
  txHash: string;
  status: string;
  starknetAddress: string;
}

export interface TokenBalance {
  token: string;
  amount: string;
  decimals: number;
}

export interface BalanceResponse {
  wbtcBalance: {
    symbol: string;
    amount: string;
    decimals: number;
  };
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

  deploy(sync: boolean = false): Observable<DeployAccountResponse> {
    return this.http.post<DeployAccountResponse>('/api/account/deploy', { sync });
  }
}
