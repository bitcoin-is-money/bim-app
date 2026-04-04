import {z} from 'zod';

export const CronRequestSchema = z.object({
  secret: z.string().min(1),
  type: z.string().min(1),
});
