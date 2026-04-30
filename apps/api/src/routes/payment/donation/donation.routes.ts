import type {TypedResponse} from 'hono';
import {Hono} from 'hono';
import type {AppContext} from '../../../app-context';
import {type ApiErrorResponse, handleDomainError} from '../../../errors';
import type {AuthenticatedHono} from '../../../types';
import type {DonationBuildBody, DonationBuildResponse} from './donation.types';
import {DonationBuildSchema} from './donation.types';

export function createDonationRoutes(appContext: AppContext): AuthenticatedHono {
  const log = appContext.logger.child({name: 'donation.routes.ts'});
  const app: AuthenticatedHono = new Hono();

  const {donationBuilder} = appContext.useCases;

  app.post('/build', async (honoCtx): Promise<TypedResponse<DonationBuildResponse | ApiErrorResponse>> => {
    try {
      const input: DonationBuildBody = DonationBuildSchema.parse(await honoCtx.req.json());
      const account = honoCtx.get('account');

      const result = await donationBuilder.build({
        amountSats: input.amountSats.toString(),
        account,
      });

      const response: DonationBuildResponse = {
        buildId: result.buildId,
        messageHash: result.messageHash,
        credentialId: result.credentialId,
      };
      return honoCtx.json(response);
    } catch (error) {
      return handleDomainError(honoCtx, error, log);
    }
  });

  return app;
}
