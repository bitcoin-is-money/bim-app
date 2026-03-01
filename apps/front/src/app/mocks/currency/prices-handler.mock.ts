import {HttpResponse} from '@angular/common/http';
import type {PricesResponse} from '../../services/currency.http.service';

const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD'];

export class PricesHandlerMock {
  // GET /api/currency/prices
  getPrices(): HttpResponse<PricesResponse> {
    return new HttpResponse({
      status: 200,
      body: {
        prices: {USD: 100000},
        supportedCurrencies: SUPPORTED_CURRENCIES,
      },
    });
  }
}
