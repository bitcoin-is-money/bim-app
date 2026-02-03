import {HttpResponse} from '@angular/common/http';
import type {ReceiveResponse} from '../../services/receive.http.service';
import {DataStoreMock} from '../data-store.mock';

interface ReceiveRequestBody {
  network: 'lightning' | 'bitcoin' | 'starknet';
  amount: string;
  tokenAddress?: string;
}

export class ReceiveHandlerMock {

  constructor(
    private readonly store: DataStoreMock
  ) {}

  createInvoice(body: ReceiveRequestBody): HttpResponse<ReceiveResponse | {error: {message: string}}> {
    const profile = this.store.getMockUserProfile();

    if (!profile.receiveInvoiceSuccess) {
      return new HttpResponse({
        status: 500,
        body: {error: {message: 'Invoice creation failed: service unavailable'}},
      });
    }

    const amount = Number(body.amount);

    let response: ReceiveResponse;
    switch (body.network) {
      case 'lightning':
        response = {
          network: 'lightning',
          swapId: 'mock-swap-' + Date.now(),
          invoice: 'lnbc' + amount + 'n1pnxk7aasp5mock0invoice0for0testing0' + Date.now(),
          amount: {value: amount, currency: 'SAT'},
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        };
        break;
      case 'bitcoin':
        response = {
          network: 'bitcoin',
          swapId: 'mock-swap-' + Date.now(),
          depositAddress: 'bc1qmockaddressfortesting',
          bip21Uri: 'bitcoin:bc1qmockaddressfortesting?amount=' + (amount / 100_000_000).toFixed(8),
          amount: {value: amount, currency: 'SAT'},
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        };
        break;
      case 'starknet': {
        const session = this.store.getSession();
        const address = session?.starknetAddress ?? '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';
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
