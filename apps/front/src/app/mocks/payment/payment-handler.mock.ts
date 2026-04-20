import { HttpResponse } from '@angular/common/http';
import { type ApiErrorResponse, ErrorCode, type SwapDirection } from '../../model';
import type {
  BuildPaymentResponse,
  ExecutePaymentResponse,
  ParsePaymentResponse,
} from '../../services/pay.http.service';
import type { DataStoreMock } from '../data-store.mock';
import { createErrorResponse } from '../mock-error';
import { scheduleSimulatedStarknetTransaction } from '../user/transaction-handler.mock';

// Delay before a simulated outgoing Starknet transfer appears after the
// payment is submitted — emulates the Apibara indexer catch-up time.
const STARKNET_SEND_SIMULATION_DELAY_MS = 4000;

export class PaymentHandlerMock {
  constructor(private readonly store: DataStoreMock) {}

  parse(_body: { paymentPayload: string }): HttpResponse<ParsePaymentResponse | ApiErrorResponse> {
    const profile = this.store.getMockUserProfile();

    if (!profile.paymentParseResult) {
      return createErrorResponse(
        400,
        ErrorCode.PAYMENT_PARSING_ERROR,
        'Failed to parse payment data',
      );
    }

    return new HttpResponse({
      status: 200,
      body: profile.paymentParseResult,
    });
  }

  build(_body: {
    paymentPayload: string;
    description?: string;
  }): HttpResponse<BuildPaymentResponse | ApiErrorResponse> {
    const profile = this.store.getMockUserProfile();

    if (!profile.paymentParseResult) {
      return createErrorResponse(
        400,
        ErrorCode.PAYMENT_PARSING_ERROR,
        'Failed to parse payment data',
      );
    }

    const payment: ParsePaymentResponse = profile.paymentBuildFee
      ? { ...profile.paymentParseResult, fee: profile.paymentBuildFee }
      : profile.paymentParseResult;

    const fakeBuildId = 'mock-build-' + String(Date.now());
    const fakeMessageHash =
      '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(''); // NOSONAR S2245 - mock fixture, not security-sensitive
    const fakeCredentialId = 'mock-credential-id';

    return new HttpResponse({
      status: 200,
      body: {
        buildId: fakeBuildId,
        messageHash: fakeMessageHash,
        credentialId: fakeCredentialId,
        payment,
      },
    });
  }

  execute(_body: {
    paymentPayload: string;
    description?: string;
  }): HttpResponse<ExecutePaymentResponse | ApiErrorResponse> {
    const profile = this.store.getMockUserProfile();

    if (!profile.paymentExecuteSuccess) {
      return createErrorResponse(500, ErrorCode.INTERNAL_ERROR, 'Payment execution failed');
    }

    const parseResult = profile.paymentParseResult;
    if (!parseResult) {
      return createErrorResponse(400, ErrorCode.PAYMENT_PARSING_ERROR, 'No payment data available');
    }

    const fakeTxHash =
      '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(''); // NOSONAR S2245 - mock fixture, not security-sensitive

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
        // Simulate the outgoing Starknet transfer appearing in the user's
        // history shortly after submit, so `waitForNew()` detects it and
        // the success page can refresh with the new transaction.
        scheduleSimulatedStarknetTransaction(
          'spent',
          parseResult.amount.value,
          parseResult.address,
          STARKNET_SEND_SIMULATION_DELAY_MS,
        );
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
