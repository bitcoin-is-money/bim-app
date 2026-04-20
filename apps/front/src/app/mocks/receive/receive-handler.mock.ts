import { HttpResponse } from '@angular/common/http';
import { type ApiErrorResponse, ErrorCode, type SwapDirection } from '../../model';
import type { ReceiveResponse } from '../../services/receive.http.service';
import type { DataStoreMock } from '../data-store.mock';
import { createErrorResponse } from '../mock-error';
import { scheduleSimulatedStarknetTransaction } from '../user/transaction-handler.mock';

// Delay before a simulated incoming Starknet transfer appears after the
// receive address is shown — emulates the Apibara indexer catch-up time.
const STARKNET_RECEIVE_SIMULATION_DELAY_MS = 5000;

interface ReceiveRequestBody {
  network: 'lightning' | 'bitcoin' | 'starknet';
  amount: string;
  description?: string;
}

export class ReceiveHandlerMock {
  constructor(private readonly store: DataStoreMock) {}

  createInvoice(body: ReceiveRequestBody): HttpResponse<ReceiveResponse | ApiErrorResponse> {
    const profile = this.store.getMockUserProfile();

    if (!profile.receiveInvoiceSuccess) {
      return createErrorResponse(
        500,
        ErrorCode.SWAP_CREATION_FAILED,
        'Invoice creation failed: service unavailable',
      );
    }

    const amount = Number(body.amount);
    const session = this.store.getSession();
    const destinationAddress =
      session?.starknetAddress ??
      '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';

    let response: ReceiveResponse;
    switch (body.network) {
      case 'lightning': {
        const swapId = 'mock-swap-ln-' + String(Date.now());
        const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
        response = {
          network: 'lightning',
          swapId,
          invoice:
            'lnbc' + String(amount) + 'n1pnxk7aasp5mock0invoice0for0testing0' + String(Date.now()),
          amount: { value: amount, currency: 'SAT' },
          expiresAt,
        };
        // Save swap for status tracking
        this.store.saveSwap({
          swapId,
          direction: 'lightning_to_starknet' as SwapDirection,
          amountSats: amount,
          destinationAddress,
          createdAt: new Date().toISOString(),
          expiresAt,
        });
        break;
      }
      case 'bitcoin': {
        const swapId = 'mock-swap-btc-' + String(Date.now());
        const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
        response = {
          network: 'bitcoin',
          swapId,
          depositAddress: 'bc1qmockaddressfortesting',
          bip21Uri: 'bitcoin:bc1qmockaddressfortesting?amount=' + (amount / 100_000_000).toFixed(8),
          amount: { value: amount, currency: 'SAT' },
          expiresAt,
        };
        // Save swap for status tracking
        this.store.saveSwap({
          swapId,
          direction: 'bitcoin_to_starknet' as SwapDirection,
          amountSats: amount,
          destinationAddress,
          createdAt: new Date().toISOString(),
          expiresAt,
        });
        break;
      }
      case 'starknet': {
        const address = destinationAddress;
        response = {
          network: 'starknet',
          address,
          uri: `starknet:${address}`,
        };
        // Simulate an incoming Starknet transfer a few seconds later so that
        // the frontend's `waitForNew()` polling has something to detect and
        // can fire the receive.starknet.completed notification.
        scheduleSimulatedStarknetTransaction(
          'receipt',
          amount,
          '0x0123456789abcdef',
          STARKNET_RECEIVE_SIMULATION_DELAY_MS,
        );
        break;
      }
    }

    return new HttpResponse({
      status: 200,
      body: response,
    });
  }
}
