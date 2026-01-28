import {Injectable} from '@angular/core';
import {map, Observable} from 'rxjs';
import {Amount} from "../model";
import {AccountHttpService, DeployAccountResponse, DeploymentStatusResponse} from './account.http.service';

@Injectable({
  providedIn: 'root',
})
export class AccountService {
  constructor(
    private readonly httpService: AccountHttpService,
  ) {
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

  deploy(sync: boolean = false): Observable<DeployAccountResponse> {
    return this.httpService.deploy(sync);
  }
}
