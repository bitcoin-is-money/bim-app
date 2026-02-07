import {HttpResponse} from '@angular/common/http';
import {type ApiErrorResponse, ErrorCode} from '../../model';
import {BalanceResponse, DeployAccountResponse, DeploymentStatusResponse,} from '../../services/account.http.service';
import {DataStoreMock} from '../data-store.mock';
import {createErrorResponse} from '../mock-error';

const MOCK_DEPLOYMENT_DELAY_MS = 2000;

export class AccountHandlerMock {
  constructor(private readonly store: DataStoreMock) {}

  // GET /api/account/deployment-status
  getDeploymentStatus(): HttpResponse<DeploymentStatusResponse | ApiErrorResponse> {
    const account = this.store.getSession();
    if (!account) {
      return createErrorResponse(401, ErrorCode.UNAUTHORIZED, 'Not authenticated');
    }

    const registrationDate: Date = this.store.getRegistrationDate() ?? new Date();
    const timeToWait = Date.now() - registrationDate.getTime();
    if (!registrationDate || timeToWait < MOCK_DEPLOYMENT_DELAY_MS) {
      return new HttpResponse({status: 200, body: {status: 'deploying', txHash: null, isDeployed: false}});
    }

    if (!this.store.getMockUserProfile().deployAccountSuccess) {
      return createErrorResponse(500, ErrorCode.ACCOUNT_DEPLOYMENT_FAILED, 'Account deployment failed');
    }

    // Deployment complete — update session account status
    const fakeTxHash = '0x' + 'abc123'.repeat(10);
    if (account.status !== 'deployed') {
      this.store.setSession({...account, status: 'deployed'});
    }

    return new HttpResponse({status: 200, body: {status: 'deployed', txHash: fakeTxHash, isDeployed: true}});
  }

  // GET /api/account/balance
  getBalance(): HttpResponse<BalanceResponse | ApiErrorResponse> {
    const account = this.store.getSession();
    if (!account) {
      return createErrorResponse(401, ErrorCode.UNAUTHORIZED, 'Not authenticated');
    }

    const amount: string = this.store.getMockUserProfile().balance;
    return new HttpResponse({
      status: 200,
      body: {
        wbtcBalance: {
          symbol: 'WBTC',
          amount: amount,
          decimals: 8,
        },
      },
    });
  }

  // POST /api/account/deploy
  deploy(): HttpResponse<DeployAccountResponse | ApiErrorResponse> {
    const account = this.store.getSession();
    if (!account) {
      return createErrorResponse(401, ErrorCode.UNAUTHORIZED, 'Not authenticated');
    }

    // Update account status to deploying and set registration date for polling
    const starknetAddress = '0x' + '1'.repeat(64);
    this.store.setSession({...account, status: 'deploying', starknetAddress});
    this.store.setRegistrationDate(new Date());

    return new HttpResponse({
      status: 200,
      body: {
        txHash: '0x' + 'abc123'.repeat(10),
        status: 'deploying',
        starknetAddress,
      },
    });
  }
}
