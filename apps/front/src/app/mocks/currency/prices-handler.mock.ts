import {HttpResponse} from '@angular/common/http';
import {ConversionRates} from "../../model";

export class PricesHandlerMock {
  // GET /api/prices
  getPrices(): HttpResponse<ConversionRates> {
    return new HttpResponse({
      status: 200,
      body: {
        BTC_USD: 100000,
      },
    });
  }
}
