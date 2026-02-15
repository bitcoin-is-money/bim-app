import {Injectable, signal} from '@angular/core';
import {map, Observable} from 'rxjs';
import {environment} from "../../environments/environment";
import {Amount} from "../model";
import {AccountHttpService, DeployAccountResponse, DeploymentStatusResponse} from './account.http.service';

@Injectable({
  providedIn: 'root',
})
export class AccountService {

  readonly balance = signal<Amount | undefined>(undefined);

  constructor(
    private readonly httpService: AccountHttpService,
  ) {
  }

  loadBalance(): void {
    this.getBalance().subscribe({
      next: (balance) => this.balance.set(balance),
      error: (err) => console.error('Error loading balance:', err),
    });
  }

  getBalance(): Observable<Amount> {
    return this.httpService
      .getBalance()
      .pipe(
        map((response) => {
          const sats = Number(response.wbtcBalance.amount);
          return Amount.of(sats, 'SAT');
        })
      );
  }

  getDeploymentStatus(): Observable<DeploymentStatusResponse> {
    return this.httpService.getDeploymentStatus();
  }

  deploy(): Observable<DeployAccountResponse> {
    return this.httpService.deploy(environment.waitForAccountDeployment);
  }
}
