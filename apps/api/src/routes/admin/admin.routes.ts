import type {TypedResponse} from 'hono';
import {Hono} from 'hono';

import type {Logger} from "pino";
import type {AppContext} from "../../app-context";
import type {ApiErrorResponse} from '../../errors';
import {handleDomainError} from '../../errors';
import {createAuthMiddleware} from '../../middleware/auth.middleware';
import type {GetLogLevelResponse, UpdateLogLevelBody, UpdateLogLevelResponse} from './admin.types';
import {UpdateLogLevelSchema} from './admin.types';

export function createAdminRoutes(appContext: AppContext): Hono {
  const rootLogger: Logger = appContext.logger;
  const log: Logger = rootLogger.child({name: 'admin.routes.ts'});
  const app = new Hono();

  app.use('*', createAuthMiddleware(appContext));

  app.get('/log-level', (honoCtx): TypedResponse<GetLogLevelResponse> => {
    return honoCtx.json<GetLogLevelResponse>({level: rootLogger.level});
  });

  app.put('/log-level', async (honoCtx): Promise<TypedResponse<UpdateLogLevelResponse | ApiErrorResponse>> => {
    try {
      const {level}: UpdateLogLevelBody = UpdateLogLevelSchema.parse(await honoCtx.req.json());

      rootLogger.level = level;
      log.info(`Log level changed to ${level} at runtime`);

      return honoCtx.json<UpdateLogLevelResponse>({level: rootLogger.level});
    } catch (error) {
      return handleDomainError(honoCtx, error, log);
    }
  });

  return app;
}
