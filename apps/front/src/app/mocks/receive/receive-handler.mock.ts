import {HttpResponse} from '@angular/common/http';
import {type ApiErrorResponse, ErrorCode, type SwapDirection} from '../../model';
import type {ReceiveResponse} from '../../services/receive.http.service';
import {DataStoreMock} from '../data-store.mock';
import {createErrorResponse} from '../mock-error';

interface ReceiveRequestBody {
  network: 'lightning' | 'bitcoin' | 'starknet';
  amount: string;
  tokenAddress?: string;
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
        'Invoice creation failed: service unavailable'
      );
    }

    const amount = Number(body.amount);
    const session = this.store.getSession();
    const destinationAddress =
      session?.starknetAddress ?? '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';

    let response: ReceiveResponse;
    switch (body.network) {
      case 'lightning': {
        const swapId = 'mock-swap-ln-' + Date.now();
        const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
        response = {
          network: 'lightning',
          swapId,
          invoice: 'lnbc' + amount + 'n1pnxk7aasp5mock0invoice0for0testing0' + Date.now(),
          amount: {value: amount, currency: 'SAT'},
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
        const swapId = 'mock-swap-btc-' + Date.now();
        const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
        response = {
          network: 'bitcoin',
          swapId,
          depositAddress: 'bc1qmockaddressfortesting',
          bip21Uri: 'bitcoin:bc1qmockaddressfortesting?amount=' + (amount / 100_000_000).toFixed(8),
          amount: {value: amount, currency: 'SAT'},
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
        break;
      }
    }

    return new HttpResponse({
      status: 200,
      body: response,
    });
  }
}
