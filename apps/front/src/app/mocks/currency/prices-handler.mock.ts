import { HttpResponse } from '@angular/common/http';
import type { PricesResponse } from '../../services/currency.http.service';

export class PricesHandlerMock {
  getPrices(): HttpResponse<PricesResponse> {
    return new HttpResponse({
      status: 200,
      body: {
        AUD: 148000,
        CAD: 132000,
        CHF: 84000,
        EUR: 89000,
        GBP: 76000,
        JPY: 14500000,
        USD: 97000,
      },
    });
  }
}
