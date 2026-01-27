import {Injectable} from '@angular/core';
import {map, Observable} from 'rxjs';
import {Amount} from "../model";
import {AccountHttpService, DeploymentStatusResponse} from './account.http.service';

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
        map((response) => Amount.of(response.amount, response.currency))
      );
  }

  getDeploymentStatus(): Observable<DeploymentStatusResponse> {
    return this.httpService.getDeploymentStatus();
  }
}
