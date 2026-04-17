import {z} from 'zod';

export const DonationBuildSchema = z.object({
  amountSats: z.number().int().positive(),
});

export type DonationBuildBody = z.infer<typeof DonationBuildSchema>;

export interface DonationBuildResponse {
  buildId: string;
  /** Starknet message hash as hex string (0x-prefixed), used as WebAuthn challenge */
  messageHash: string;
  /** Account's credential ID (base64url-encoded) for WebAuthn allowCredentials */
  credentialId: string;
}
