// =============================================================================
// Lightning Decoder
// =============================================================================

/**
 * Port for decoding BOLT11 Lightning invoices.
 *
 * Extracts amount, description, and expiry from the encoded invoice string.
 * The domain uses this to present full payment details after QR code parsing.
 */
export interface LightningDecoder {
  /** Decodes a BOLT11 Lightning invoice string into its components. */
  decode(invoice: string): DecodedLightningInvoice;
}

/** Decoded fields from a BOLT11 Lightning invoice. */
export interface DecodedLightningInvoice {
  /** Amount in millisatoshis, if specified in the invoice. */
  amountMSat?: bigint;
  /** Human-readable description / memo attached to the invoice. */
  description?: string;
  /** Expiration date of the invoice, if applicable. */
  expiresAt?: Date;
}

// =============================================================================
// Transaction Manager
// =============================================================================

/**
 * Infrastructure port for executing operations within a database transaction.
 * Ensures atomicity across multiple repository calls.
 */
export interface TransactionManager {
  /** Executes the given function within a single database transaction. */
  execute<T>(fn: () => Promise<T>): Promise<T>;
}
