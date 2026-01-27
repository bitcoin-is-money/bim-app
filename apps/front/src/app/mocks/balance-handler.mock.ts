import {HttpResponse} from '@angular/common/http';
import type {Currency} from '../model';

interface BalanceResponse {
  amount: number;
  currency: Currency;
}

export class BalanceHandlerMock {
  // GET /api/balance
  getBalance(): HttpResponse<BalanceResponse> {
    return new HttpResponse({
      status: 200,
      body: {
        amount: 1,
        currency: 'BTC',
      },
    });
  }
}
