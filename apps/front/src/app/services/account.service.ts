import { inject, Injectable, signal } from '@angular/core';
import { formatTokenAmount } from '@bim/lib/token';
import type { Observable } from 'rxjs';
import { map, tap } from 'rxjs';
import { Amount } from '../model';
import type {
  AccountInfoResponse,
  DeployAccountResponse,
  DeploymentStatusResponse,
} from './account.http.service';
import { AccountHttpService } from './account.http.service';

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
      error: (err) => {
        console.error('Error loading balance:', err);
      },
    });
  }

  refreshBalance(): Observable<void> {
    return this.httpService.getBalance().pipe(
      tap((response) => {
        this.strkBalance.set(
          formatTokenAmount(response.strkBalance.amount, response.strkBalance.decimals, {
            fractionDigits: 2,
            omitZeroFraction: true,
          }),
        );
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
