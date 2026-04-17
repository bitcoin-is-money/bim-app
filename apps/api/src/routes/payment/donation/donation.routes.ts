import type {PreparedCalls} from '@bim/domain/payment';
import {Amount} from '@bim/domain/shared';
import type {TypedResponse} from 'hono';
import {Hono} from 'hono';
import {randomUUID} from 'node:crypto';
import type {AppContext} from '../../../app-context';
import {type ApiErrorResponse, createErrorResponse, ErrorCode, handleDomainError} from '../../../errors';
import type {AuthenticatedHono} from '../../../types';
import type {DonationBuildBody, DonationBuildResponse} from './donation.types';
import {DonationBuildSchema} from './donation.types';

export function createDonationRoutes(appContext: AppContext): AuthenticatedHono {
  const log = appContext.logger.child({name: 'donation.routes.ts'});
  const app: AuthenticatedHono = new Hono();

  app.post('/build', async (honoCtx): Promise<TypedResponse<DonationBuildResponse | ApiErrorResponse>> => {
    try {
      const input: DonationBuildBody = DonationBuildSchema.parse(await honoCtx.req.json());

      const account = honoCtx.get('account');
      const senderAddress = account.getStarknetAddress();
      if (!senderAddress) {
        return createErrorResponse(honoCtx, 400, ErrorCode.ACCOUNT_NOT_DEPLOYED, 'Account not deployed');
      }

      const treasuryAddress = appContext.starknetConfig.feeTreasuryAddress;
      const wbtcTokenAddress = appContext.starknetConfig.wbtcTokenAddress;
      const amount = Amount.ofSatoshi(BigInt(input.amountSats));

      // Build ERC-20 transfer call to treasury (no fee on donations)
      const calls = [{
        contractAddress: wbtcTokenAddress.toString(),
        entrypoint: 'transfer' as const,
        calldata: [treasuryAddress.toString(), amount.toSatString(), '0'] as const,
      }];

      // Build typed data via AVNU paymaster
      const {typedData, messageHash} = await appContext.gateways.starknet.buildCalls({
        senderAddress,
        calls,
      });

      // Cache for execute step (reuses /pay/execute via shared paymentBuildCache)
      const buildId = randomUUID();
      const preparedCalls: PreparedCalls = {
        network: 'starknet',
        calls,
        amount,
        feeAmount: Amount.zero(),
        recipientAddress: treasuryAddress,
        tokenAddress: wbtcTokenAddress,
      };

      appContext.paymentBuildCache.set(buildId, {
        preparedCalls,
        typedData,
        senderAddress,
        accountId: account.id,
        description: 'Donation',
        createdAt: Date.now(),
        isDonation: true,
      });

      const response: DonationBuildResponse = {
        buildId,
        messageHash,
        credentialId: account.credentialId,
      };
      return honoCtx.json(response) as TypedResponse<DonationBuildResponse>;
    } catch (error) {
      return handleDomainError(honoCtx, error, log);
    }
  });

  return app;
}
