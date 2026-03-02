import {HttpResponse} from '@angular/common/http';
import {type ApiErrorResponse, ErrorCode, type SwapDirection} from '../../model';
import type {ExecutePaymentResponse, ParsePaymentResponse} from '../../services/pay.http.service';
import type {DataStoreMock} from '../data-store.mock';
import {createErrorResponse} from '../mock-error';

export class PaymentHandlerMock {
  constructor(private readonly store: DataStoreMock) {}

  parse(_body: {paymentPayload: string}): HttpResponse<ParsePaymentResponse | ApiErrorResponse> {
    const profile = this.store.getMockUserProfile();

    if (!profile.paymentParseResult) {
      return createErrorResponse(400, ErrorCode.PAYMENT_PARSING_ERROR, 'Failed to parse payment data');
    }

    return new HttpResponse({
      status: 200,
      body: profile.paymentParseResult,
    });
  }

  execute(_body: {paymentPayload: string; description?: string}): HttpResponse<ExecutePaymentResponse | ApiErrorResponse> {
    const profile = this.store.getMockUserProfile();

    if (!profile.paymentExecuteSuccess) {
      return createErrorResponse(500, ErrorCode.INTERNAL_ERROR, 'Payment execution failed');
    }

    const parseResult = profile.paymentParseResult;
    if (!parseResult) {
      return createErrorResponse(400, ErrorCode.PAYMENT_PARSING_ERROR, 'No payment data available');
    }

    const fakeTxHash =
      '0x' +
      Array.from({length: 64}, () => Math.floor(Math.random() * 16).toString(16)).join('');

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
      case 'lightning': {
        const swapId = 'mock-swap-ln-pay-' + String(Date.now());
        const expiresAt = parseResult.expiresAt ?? new Date(Date.now() + 3_600_000).toISOString();
        response = {
          network: 'lightning',
          txHash: fakeTxHash,
          amount: parseResult.amount,
          swapId,
          invoice: parseResult.invoice,
          expiresAt,
        };
        // Save swap for status tracking
        this.store.saveSwap({
          swapId,
          direction: 'starknet_to_lightning' as SwapDirection,
          amountSats: parseResult.amount.value,
          destinationAddress: parseResult.invoice,
          createdAt: new Date().toISOString(),
          expiresAt,
        });
        break;
      }
      case 'bitcoin': {
        const swapId = 'mock-swap-btc-pay-' + String(Date.now());
        const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
        response = {
          network: 'bitcoin',
          txHash: fakeTxHash,
          amount: parseResult.amount,
          swapId,
          destinationAddress: parseResult.address,
          expiresAt,
        };
        // Save swap for status tracking
        this.store.saveSwap({
          swapId,
          direction: 'starknet_to_bitcoin' as SwapDirection,
          amountSats: parseResult.amount.value,
          destinationAddress: parseResult.address,
          createdAt: new Date().toISOString(),
          expiresAt,
        });
        break;
      }
    }

    return new HttpResponse({
      status: 200,
      body: response,
    });
  }
}
