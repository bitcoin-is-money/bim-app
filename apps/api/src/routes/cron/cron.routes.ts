import type {Context, Hono, TypedResponse} from 'hono';
import type {Logger} from 'pino';
import {type ApiErrorResponse, createErrorResponse, ErrorCode} from '../../errors';
import type {BalanceMonitoring} from '../../monitoring/balance.monitoring';
import {CronRequestSchema} from './cron.schemas';

export interface CronRoutesDeps {
  readonly cronSecret: string;
  readonly balanceMonitoring: BalanceMonitoring;
  readonly logger: Logger;
}

export interface CronResponse {
  ok: boolean;
}

export function createCronRoutes(
  app: Hono,
  deps: CronRoutesDeps,
): void {
  const log = deps.logger.child({name: 'cron.routes.ts'});

  app.post('/', async (honoCtx: Context): Promise<TypedResponse<CronResponse | ApiErrorResponse>> => {
    try {
      const input = CronRequestSchema.parse(await honoCtx.req.json());

      if (input.secret !== deps.cronSecret) {
        log.warn('Cron request with invalid secret');
        return createErrorResponse(honoCtx, 401, ErrorCode.UNAUTHORIZED, 'Invalid secret');
      }

      switch (input.type) {
        case 'balance-check':
          await deps.balanceMonitoring.run();
          return honoCtx.json<CronResponse>({ok: true});

        default:
          log.warn({type: input.type}, 'Unknown cron type');
          return createErrorResponse(honoCtx, 400, ErrorCode.VALIDATION_ERROR, `Unknown cron type: ${input.type}`);
      }
    } catch (error) {
      log.error(error, 'Cron handler error');
      return createErrorResponse(honoCtx, 500, ErrorCode.INTERNAL_ERROR, 'Internal server error');
    }
  });
}
