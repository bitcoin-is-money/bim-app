import {isValidLevel} from "@bim/lib/logger";
import type {TypedResponse} from 'hono';
import {Hono} from 'hono';

import type {Logger} from "pino";
import type {AppContext} from "../../app-context";
import type {ApiErrorResponse} from '../../errors';
import {createErrorResponse, ErrorCode} from '../../errors';
import type {GetLogLevelResponse, UpdateLogLevelResponse} from './admin.types';

export function createAdminRoutes(appContext: AppContext): Hono {
  const rootLogger: Logger = appContext.logger;
  const log: Logger = rootLogger.child({name: 'admin.routes.ts'});
  const app = new Hono();

  app.get('/log-level', (honoCtx): TypedResponse<GetLogLevelResponse> => {
    return honoCtx.json<GetLogLevelResponse>({level: rootLogger.level});
  });

  app.put('/log-level', async (honoCtx): Promise<TypedResponse<UpdateLogLevelResponse | ApiErrorResponse>> => {
    const body = await honoCtx.req.json();
    const {level} = body;

    if (!isValidLevel(level)) {
      return createErrorResponse(
        honoCtx,
        400,
        ErrorCode.VALIDATION_ERROR,
        'Invalid level. Valid: debug, info, warn, error, silent');
    }

    rootLogger.level = level;
    log.info(`Log level changed to ${level} at runtime`);

    return honoCtx.json<UpdateLogLevelResponse>({level: rootLogger.level});
  });

  return app;
}
