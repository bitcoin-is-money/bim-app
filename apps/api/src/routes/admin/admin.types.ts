import {z} from 'zod';

export const UpdateLogLevelSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error', 'silent']),
});

/** Validated body for PUT /api/admin/log-level */
export type UpdateLogLevelBody = z.infer<typeof UpdateLogLevelSchema>;

/** API response from GET /api/admin/log-level */
export interface GetLogLevelResponse {
  level: string;
}

/** API response from PUT /api/admin/log-level */
export interface UpdateLogLevelResponse {
  level: string;
}
