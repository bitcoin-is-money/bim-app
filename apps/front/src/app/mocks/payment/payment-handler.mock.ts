import {HttpResponse} from '@angular/common/http';
import {ParsePaymentResponse} from '../../services/payment.http.service';
import {DataStoreMock} from './../data-store.mock';

export class PaymentHandlerMock {

  constructor(
    private readonly store: DataStoreMock
  ) {}

  parse(_body: {data: string}): HttpResponse<ParsePaymentResponse | {error: {message: string}}> {
    const profile = this.store.getMockUserProfile();

    if (!profile.paymentParseResult) {
      return new HttpResponse({
        status: 400,
        body: {error: {message: 'Failed to parse payment data'}},
      });
    }

    return new HttpResponse({
      status: 200,
      body: profile.paymentParseResult,
    });
  }
}
