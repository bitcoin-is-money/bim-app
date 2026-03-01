import {z} from 'zod';

export const UpdateSettingsSchema = z.object({
  language: z.string().optional(),
  preferredCurrencies: z.array(z.string()).optional(),
  defaultCurrency: z.string().optional(),
});
