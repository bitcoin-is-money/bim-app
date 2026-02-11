import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import {Observable, of, throwError} from 'rxjs';
import {delay, mergeMap} from 'rxjs/operators';
import {AccountHandlerMock} from './account/account-handler.mock';
import {AuthHandlerMock} from './auth/auth-handler.mock';
import {DataStoreMock} from "./data-store.mock";
import {PaymentHandlerMock} from './payment/payment-handler.mock';
import {PricesHandlerMock} from './currency/prices-handler.mock';
import {ReceiveHandlerMock} from './receive/receive-handler.mock';
import {SettingsHandlerMock} from './user/settings-handler.mock';
import {SwapHandlerMock} from './swap/swap-handler.mock';
import {TransactionHandlerMock} from './user/transaction-handler.mock';

const store = new DataStoreMock();
const mockAuthHandler = new AuthHandlerMock(store);
const mockAccountHandler = new AccountHandlerMock(store);
const mockPricesHandler = new PricesHandlerMock();
const mockTransactionHandler = new TransactionHandlerMock(store);
const mockPaymentHandler = new PaymentHandlerMock(store);
const mockReceiveHandler = new ReceiveHandlerMock(store);
const mockSwapHandler = new SwapHandlerMock(store);
const mockSettingsHandler = new SettingsHandlerMock(store);

const payDelay = 3000;
const receiveDelay = 3000;

function randomDelay(): number {
  return 100 + Math.random() * 400; // 100-500ms
}

export const backendInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> => {
  const url = req.urlWithParams;
  const {method, body} = req;
  let httpFakeDelay = randomDelay();

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
  else if (url.startsWith('/api/user/transactions') && method === 'GET') {
    response = mockTransactionHandler.getTransactions(req);
  }

  // User settings routes
  else if (url === '/api/user/settings' && method === 'GET') {
    response = mockSettingsHandler.getSettings();
  } else if (url === '/api/user/settings' && method === 'PUT') {
    response = mockSettingsHandler.updateSettings(body as Record<string, unknown>);
  }

  // Payment routes
  else if (url === '/api/payment/pay/parse' && method === 'POST') {
    response = mockPaymentHandler.parse(body as { paymentPayload: string });
  } else if (url === '/api/payment/pay/execute' && method === 'POST') {
    response = mockPaymentHandler.execute(body as { paymentPayload: string });
    httpFakeDelay = payDelay;
  } else if (url === '/api/payment/receive' && method === 'POST') {
    response = mockReceiveHandler.createInvoice(body as Parameters<typeof mockReceiveHandler.createInvoice>[0]);
    httpFakeDelay = receiveDelay;
  }

  // Swap routes
  else if (url.startsWith('/api/swap/status/') && method === 'GET') {
    const swapId = url.split('/api/swap/status/')[1];
    response = mockSwapHandler.getStatus(swapId!);
  }

  if (response) {
    console.log(`[MockBackend] ${method} ${url}`, {body, response: response.body, status: response.status});

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
    return of(response).pipe(delay(httpFakeDelay));
  }

  // Pass through unknown routes
  console.warn(`[MockBackend] Unhandled route: ${method} ${url}`);
  return next(req);
};
