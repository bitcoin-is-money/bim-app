import {HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest, HttpResponse,} from '@angular/common/http';
import {Observable, of, throwError} from 'rxjs';
import {delay, mergeMap} from 'rxjs/operators';
import {AuthHandlerMock} from './auth-handler.mock';
import {AccountHandlerMock} from './account-handler.mock';
import {DataStoreMock} from "./data-store.mock";
import {PricesHandlerMock} from './prices-handler.mock';
import {TransactionHandlerMock} from './transaction-handler.mock';

const store = new DataStoreMock();
const mockAuthHandler = new AuthHandlerMock(store);
const mockAccountHandler = new AccountHandlerMock(store);
const mockPricesHandler = new PricesHandlerMock();
const mockTransactionHandler = new TransactionHandlerMock(store);

function randomDelay(): number {
  return 100 + Math.random() * 400; // 100-500ms
}

export const backendInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> => {
  const url = req.urlWithParams;
  const { method, body } = req;

  // Only intercept /api/ requests
  if (!url.startsWith('/api/')) {
    return next(req);
  }

  let response: HttpResponse<unknown> | undefined;

  // Auth routes
  if (url === '/api/auth/register/begin' && method === 'POST') {
    response = mockAuthHandler.beginRegister(body as { username: string });
  } else if (url === '/api/auth/register/complete' && method === 'POST') {
    response = mockAuthHandler.completeRegister(
      body as Parameters<typeof mockAuthHandler.completeRegister>[0]
    );
  } else if (url === '/api/auth/login/begin' && method === 'POST') {
    response = mockAuthHandler.beginLogin();
  } else if (url === '/api/auth/login/complete' && method === 'POST') {
    response = mockAuthHandler.completeLogin(
      body as Parameters<typeof mockAuthHandler.completeLogin>[0]
    );
  } else if (url === '/api/auth/session' && method === 'GET') {
    response = mockAuthHandler.getSession();
  } else if (url === '/api/auth/logout' && method === 'POST') {
    response = mockAuthHandler.logout();
  }

  // Account routes
  else if (url === '/api/account/deploy' && method === 'POST') {
    response = mockAccountHandler.deploy();
  } else if (url === '/api/account/deployment-status' && method === 'GET') {
    response = mockAccountHandler.getDeploymentStatus();
  } else if (url === '/api/account/balance' && method === 'GET') {
    response = mockAccountHandler.getBalance();
  }

  // Prices routes
  else if (url === '/api/currency/prices' && method === 'GET') {
    response = mockPricesHandler.getPrices();
  }

  // Transaction routes
  else if (url.startsWith('/api/transactions') && method === 'GET') {
    response = mockTransactionHandler.getTransactions(req);
  }

  if (response) {
    console.log(`[MockBackend] ${method} ${url}`, { body, response: response.body, status: response.status });

    // Convert error responses (4xx, 5xx) to HttpErrorResponse
    if (response.status >= 400) {
      return of(null).pipe(
        delay(randomDelay()),
        mergeMap(() => throwError(() => new HttpErrorResponse({
          error: response.body,
          status: response.status,
          statusText: response.statusText,
          url: url,
        })))
      );
    }

    return of(response).pipe(delay(randomDelay()));
  }

  // Pass through unknown routes
  console.warn(`[MockBackend] Unhandled route: ${method} ${url}`);
  return next(req);
};
