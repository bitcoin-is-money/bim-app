import {ec, Signer} from 'starknet';

/**
 * Deterministic STARK signer for testing on devnet.
 *
 * This class provides a STARK key pair for testing Starknet account
 * deployment on devnet. Since devnet uses OpenZeppelin's standard
 * account class (which expects STARK signatures, not P256), we need a
 * STARK signer for deployment transactions.
 *
 * The P256Signer is still used for WebAuthn credential creation/verification,
 * but for on-chain deployment on devnet, we use this STARK signer.
 *
 * In production, the actual WebAuthn account contract would verify P256
 * signatures directly. The separation here is a testing limitation.
 */
export class StarkSigner {
  private readonly privateKey: string;
  private readonly publicKey: string;
  private readonly signer: Signer;

  /**
   * Creates a StarkSigner with a specific private key.
   *
   * @param privateKey - The STARK private key (hex string)
   */
  constructor(privateKey: string) {
    this.privateKey = privateKey;
    this.signer = new Signer(privateKey);
    this.publicKey = ec.starkCurve.getStarkKey(privateKey);
  }

  /**
   * Creates a StarkSigner from a devnet pre-funded account.
   * This ensures the keys are valid and compatible with the devnet account class.
   */
  static fromDevnetPrivateKey(privateKey: string): StarkSigner {
    return new StarkSigner(privateKey);
  }

  /**
   * Signs a message hash with the STARK private key using starknet.js Signer.
   *
   * @param messageHash - The hash to sign (hex string with or without 0x prefix)
   * @returns The signature as r and s components (strings)
   */
  sign(messageHash: string): {r: string; s: string} {
    const signature = ec.starkCurve.sign(messageHash, this.privateKey);
    return {
      r: '0x' + signature.r.toString(16),
      s: '0x' + signature.s.toString(16),
    };
  }

  /**
   * Signs a message hash and returns the signature as an array of hex strings.
   * This format is expected by Starknet transactions.
   *
   * @param messageHash - The hash to sign
   * @returns Array of [r, s] as hex strings
   */
  signAsArray(messageHash: string): string[] {
    const {r, s} = this.sign(messageHash);
    return [r, s];
  }

  /**
   * Gets the starknet.js Signer instance.
   * This can be used directly with Account for proper signing.
   */
  getSigner(): Signer {
    return this.signer;
  }

  /**
   * Gets the public key as a hex string.
   * This is used for account address calculation and constructor calldata.
   */
  getPublicKey(): string {
    return this.publicKey;
  }

  /**
   * Gets the public key padded to 64 hex characters (256 bits).
   * Starknet addresses require properly formatted field elements.
   */
  getPublicKeyPadded(): string {
    const hex = this.publicKey.replace('0x', '');
    return '0x' + hex.padStart(64, '0');
  }

  /**
   * Gets the private key (for debugging only).
   */
  getPrivateKey(): string {
    return this.privateKey;
  }
}

/**
 * Singleton instance for consistent key usage across tests.
 */
let sharedStarkSigner: StarkSigner | undefined;

/**
 * Default private key for testing (when no devnet account is available).
 * This is a simple key that works with the Stark curve.
 */
const DEFAULT_PRIVATE_KEY = '0x71d7bb07b9a64f6f78ac4c816aff4da9';

/**
 * Gets the shared StarkSigner instance.
 * All test components should use this to ensure consistent keys.
 *
 * @param privateKey - Optional private key to use. If not provided, uses default.
 */
export function getSharedStarkSigner(privateKey?: string): StarkSigner {
  if (!sharedStarkSigner) {
    sharedStarkSigner = new StarkSigner(privateKey || DEFAULT_PRIVATE_KEY);
  }
  return sharedStarkSigner;
}

/**
 * Sets the shared StarkSigner instance with a specific private key.
 * This should be called during test setup with a devnet account's private key.
 */
export function setSharedStarkSigner(privateKey: string): void {
  sharedStarkSigner = new StarkSigner(privateKey);
}

/**
 * Resets the shared signer (for test isolation if needed).
 */
export function resetSharedStarkSigner(): void {
  sharedStarkSigner = undefined;
}
