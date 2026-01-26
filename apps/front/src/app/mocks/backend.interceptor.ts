import {HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest, HttpResponse,} from '@angular/common/http';
import {Observable, of} from 'rxjs';
import {delay} from 'rxjs/operators';
import {AuthHandlerMock} from './auth-handler.mock';
import {BalanceHandlerMock} from './balance-handler.mock';
import {TransactionHandlerMock} from './transaction-handler.mock';

const mockAuthHandler = new AuthHandlerMock();
const mockBalanceHandler = new BalanceHandlerMock();
const mockTransactionHandler = new TransactionHandlerMock();

function randomDelay(): number {
  return 100 + Math.random() * 400; // 100-500ms
}

export const backendInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> => {
  const { url, method, body } = req;

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

  // Balance routes
  else if (url === '/api/balance' && method === 'GET') {
    response = mockBalanceHandler.getBalance();
  }

  // Transaction routes
  else if (url === '/api/transactions' && method === 'GET') {
    response = mockTransactionHandler.getTransactions();
  }

  if (response) {
    console.log(`[MockBackend] ${method} ${url}`, { body, response: response.body });
    return of(response).pipe(delay(randomDelay()));
  }

  // Pass through unknown routes
  console.warn(`[MockBackend] Unhandled route: ${method} ${url}`);
  return next(req);
};
