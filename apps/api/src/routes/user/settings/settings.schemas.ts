import {z} from 'zod';

export const UpdateSettingsSchema = z.object({
  language: z.string().optional(),
  fiatCurrency: z.string().optional(),
});
