import {type ReceiveResult} from '@bim/domain/payment';
import {Amount} from '@bim/domain/shared';
import {Hono} from 'hono';
import type {TypedResponse} from 'hono';
import {basename} from 'node:path';
import type {AppContext} from '../../../app-context';
import {ErrorCode, createErrorResponse, handleDomainError, type ApiErrorResponse} from '../../../errors';
import type {AuthenticatedHono} from '../../../types';
import {ReceiveSchema} from './receive.schemas';
import type {ReceiveResponse} from './receive.types';

// =============================================================================
// Routes
// =============================================================================

export function createReceiveRoutes(appContext: AppContext): AuthenticatedHono {
  const log = appContext.logger.child({name: basename(import.meta.filename)});
  const app: AuthenticatedHono = new Hono();

  const {receive: receiveService} = appContext.services;

  // ---------------------------------------------------------------------------
  // Create receive request
  // ---------------------------------------------------------------------------

  app.post('/', async (honoCtx): Promise<TypedResponse<ReceiveResponse | ApiErrorResponse>> => {
    try {
      const body = await honoCtx.req.json();
      const input = ReceiveSchema.parse(body);

      const account = honoCtx.get('account');
      const starknetAddress = account.getStarknetAddress();
      if (!starknetAddress) {
        return createErrorResponse(honoCtx, 400, ErrorCode.ACCOUNT_NOT_DEPLOYED, 'Account not deployed');
      }

      const amount = input.amount ? Amount.ofSatoshi(BigInt(input.amount)) : undefined;

      const result = await receiveService.receive({
        network: input.network,
        destinationAddress: starknetAddress,
        amount,
        tokenAddress: input.tokenAddress,
        description: input.description,
        accountId: account.id,
      });

      return honoCtx.json<ReceiveResponse>(serializeReceiveResult(result));
    } catch (error) {
      return handleDomainError(honoCtx, error, log);
    }
  });

  return app;
}

// =============================================================================
// Serialization
// =============================================================================

function serializeReceiveResult(result: ReceiveResult): ReceiveResponse {
  switch (result.network) {
    case 'starknet':
      return {
        network: 'starknet',
        address: result.address.toString(),
        uri: result.uri,
      };
    case 'lightning':
      return {
        network: 'lightning',
        swapId: result.swapId,
        invoice: result.invoice.toString(),
        amount: {value: Number(result.amount.getSat()), currency: 'SAT'},
        expiresAt: result.expiresAt.toISOString(),
      };
    case 'bitcoin':
      return {
        network: 'bitcoin',
        swapId: result.swapId,
        depositAddress: result.depositAddress.toString(),
        bip21Uri: result.bip21Uri,
        amount: {value: Number(result.amount.getSat()), currency: 'SAT'},
        expiresAt: result.expiresAt.toISOString(),
      };
  }
}
