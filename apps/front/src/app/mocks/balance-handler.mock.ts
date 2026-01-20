import {HttpResponse} from '@angular/common/http';
import type {Balance} from '../services/balance.service';

export class BalanceHandlerMock {
  // GET /api/balance
  getBalance(): HttpResponse<Balance> {
    return new HttpResponse({
      status: 200,
      body: {
        amount: 42,
        currency: 'USD',
      },
    });
  }
}
