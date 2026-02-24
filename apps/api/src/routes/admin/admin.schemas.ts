import {z} from 'zod';

export const UpdateLogLevelSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error', 'silent']),
});
