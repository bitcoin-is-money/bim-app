import {inject, Injectable, signal} from '@angular/core';
import type {Observable} from 'rxjs';
import {map, tap} from 'rxjs';
import {Amount} from "../model";
import type {AccountInfoResponse, DeployAccountResponse, DeploymentStatusResponse} from './account.http.service';
import {AccountHttpService} from './account.http.service';

@Injectable({
  providedIn: 'root',
})
export class AccountService {

  readonly balance = signal<Amount | undefined>(undefined);

  /** STRK balance formatted as a human-readable string (e.g. "66.04") */
  readonly strkBalance = signal<string | undefined>(undefined);

  private readonly httpService = inject(AccountHttpService);

  loadBalance(): void {
    this.refreshBalance().subscribe({
      error: (err) => { console.error('Error loading balance:', err); },
    });
  }

  refreshBalance(): Observable<void> {
    return this.httpService
      .getBalance()
      .pipe(
        tap((response) => {
          this.strkBalance.set(formatTokenBalance(response.strkBalance.amount, response.strkBalance.decimals));
          const sats = Number(response.wbtcBalance.amount);
          this.balance.set(Amount.of(sats, 'SAT'));
        }),
        map(() => undefined),
      );
  }

  getAccountInfo(): Observable<AccountInfoResponse> {
    return this.httpService.getMe();
  }

  getDeploymentStatus(): Observable<DeploymentStatusResponse> {
    return this.httpService.getDeploymentStatus();
  }

  deploy(): Observable<DeployAccountResponse> {
    return this.httpService.deploy();
  }
}

/**
 * Formats a raw token balance (wei string) into a human-readable string.
 * E.g. "66041022140453590000" with 18 decimals → "66.04"
 */
function formatTokenBalance(rawAmount: string, decimals: number): string {
  if (rawAmount === '0') return '0';
  const padded = rawAmount.padStart(decimals + 1, '0');
  const whole = padded.slice(0, padded.length - decimals) || '0';
  const frac = padded.slice(padded.length - decimals, padded.length - decimals + 2);
  return frac === '00' ? whole : `${whole}.${frac}`;
}
