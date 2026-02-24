import {z} from 'zod';

export const DeployAccountSchema = z.object({
  sync: z.boolean().default(false),
});
