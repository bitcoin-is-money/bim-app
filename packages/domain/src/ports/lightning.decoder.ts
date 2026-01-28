/**
 * Port for decoding BOLT11 Lightning invoices.
 *
 * Extracts amount, description, and expiry from the encoded invoice string.
 * The domain uses this to present full payment details after QR code parsing.
 */
export interface LightningDecoder {
  decode(invoice: string): DecodedLightningInvoice;
}

export interface DecodedLightningInvoice {
  amountMSat?: bigint;
  description?: string;
  expiresAt?: Date;
}
