import {HttpClient} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import {Observable} from 'rxjs';

export interface DeploymentStatusResponse {
  status: 'pending' | 'deploying' | 'deployed' | 'failed';
  txHash: string | null;
  isDeployed: boolean;
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

export interface AccountInfoResponse {
  id: string;
  username: string;
  starknetAddress: string | null;
  status: 'pending' | 'deploying' | 'deployed' | 'failed';
  deploymentTxHash: string | null;
  createdAt: string;
}

export interface BalanceResponse {
  wbtcBalance: {
    symbol: string;
    amount: string;
    decimals: number;
  };
  strkBalance: {
    symbol: string;
    amount: string;
    decimals: number;
  };
}

@Injectable({
  providedIn: 'root',
})
export class AccountHttpService {
  private readonly http = inject(HttpClient);

  getMe(): Observable<AccountInfoResponse> {
    return this.http.get<AccountInfoResponse>('/api/account/me');
  }

  getBalance(): Observable<BalanceResponse> {
    return this.http.get<BalanceResponse>('/api/account/balance');
  }

  getDeploymentStatus(): Observable<DeploymentStatusResponse> {
    return this.http.get<DeploymentStatusResponse>('/api/account/deployment-status');
  }

  deploy(): Observable<DeployAccountResponse> {
    return this.http.post<DeployAccountResponse>('/api/account/deploy', null);
  }
}
