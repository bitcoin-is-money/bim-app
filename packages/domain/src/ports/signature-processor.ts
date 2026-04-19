import type {WebAuthnAssertion} from '../payment/types';

/**
 * Converts a raw WebAuthn assertion into a blockchain-compatible signature.
 */
export interface SignatureProcessor {
  process(assertion: WebAuthnAssertion, publicKey: string): string[];
}
