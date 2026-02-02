import {HttpResponse} from '@angular/common/http';
import {ExecutePaymentResponse, ParsePaymentResponse} from '../../services/payment.http.service';
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

  execute(_body: {data: string}): HttpResponse<ExecutePaymentResponse | {error: {message: string}}> {
    const profile = this.store.getMockUserProfile();

    if (!profile.paymentExecuteSuccess) {
      return new HttpResponse({
        status: 500,
        body: {error: {message: 'Payment execution failed'}},
      });
    }

    const parseResult = profile.paymentParseResult;
    if (!parseResult) {
      return new HttpResponse({
        status: 400,
        body: {error: {message: 'No payment data available'}},
      });
    }

    const fakeTxHash = '0x' + Array.from({length: 64}, () => Math.floor(Math.random() * 16).toString(16)).join('');

    let response: ExecutePaymentResponse;
    switch (parseResult.network) {
      case 'starknet':
        response = {
          network: 'starknet',
          txHash: fakeTxHash,
          amount: parseResult.amount,
          feeAmount: parseResult.fee,
          recipientAddress: parseResult.address,
          tokenAddress: parseResult.tokenAddress,
        };
        break;
      case 'lightning':
        response = {
          network: 'lightning',
          txHash: fakeTxHash,
          amount: parseResult.amount,
          swapId: 'mock-swap-' + Date.now(),
          invoice: parseResult.invoice,
          expiresAt: parseResult.expiresAt ?? new Date(Date.now() + 3_600_000).toISOString(),
        };
        break;
      case 'bitcoin':
        response = {
          network: 'bitcoin',
          txHash: fakeTxHash,
          amount: parseResult.amount,
          swapId: 'mock-swap-' + Date.now(),
          destinationAddress: parseResult.address,
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        };
        break;
    }

    return new HttpResponse({
      status: 200,
      body: response,
    });
  }
}
