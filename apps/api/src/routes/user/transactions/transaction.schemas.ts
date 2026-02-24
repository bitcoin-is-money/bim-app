import {z} from 'zod';

export const GetTransactionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10),
  offset: z.coerce.number().int().min(0).default(0),
});

export const SetDescriptionSchema = z.object({
  description: z.string().min(1).max(100),
});
