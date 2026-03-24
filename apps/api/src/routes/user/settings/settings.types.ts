import {z} from 'zod';

export const UpdateSettingsSchema = z.object({
  language: z.string().optional(),
  preferredCurrencies: z.array(z.string()).nonempty().optional(),
  defaultCurrency: z.string().optional(),
});

/** Validated body for PUT /api/user/settings */
export type UpdateSettingsBody = z.infer<typeof UpdateSettingsSchema>;

/** API response from GET /api/user/settings */
export interface GetSettingsResponse {
  language: string;
  preferredCurrencies: string[];
  defaultCurrency: string;
}

/** API response from PUT /api/user/settings */
export interface UpdateSettingsResponse {
  language: string;
  preferredCurrencies: string[];
  defaultCurrency: string;
}
