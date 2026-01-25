import {p256} from '@noble/curves/p256';
import {bytesToHex, hexToBytes} from '@noble/curves/abstract/utils';

/**
 * P-256 signer for testing.
 *
 * This class provides P-256 key pair generation and signing capabilities
 * used across test components:
 * - VirtualAuthenticator: for WebAuthn credential creation and assertions
 * - DevnetPaymasterGateway: for signing DEPLOY_ACCOUNT transactions
 *
 * IMPORTANT: This is for TESTING ONLY. Do not use in production.
 */
export class P256Signer {
  private readonly privateKey: Uint8Array;
  private readonly publicKey: Uint8Array;

  constructor(privateKey?: Uint8Array) {
    this.privateKey = privateKey ?? p256.utils.randomPrivateKey();
    this.publicKey = p256.getPublicKey(this.privateKey, false);
  }

  /**
   * Generates a new P256Signer with a random key pair.
   */
  static generate(): P256Signer {
    return new P256Signer();
  }

  /**
   * Creates a P256Signer from a hex-encoded private key.
   */
  static fromHex(privateKeyHex: string): P256Signer {
    return new P256Signer(hexToBytes(privateKeyHex));
  }

  /**
   * Signs data with the P-256 private key.
   *
   * @param data - The data to sign (typically a hash)
   * @returns The signature as r and s components (bigint)
   */
  sign(data: Uint8Array): {r: bigint; s: bigint} {
    const sig = p256.sign(data, this.privateKey, {lowS: true});
    return {r: sig.r, s: sig.s};
  }

  /**
   * Signs a hex-encoded hash (like a Starknet transaction hash).
   *
   * @param hexHash - The hash to sign (with or without 0x prefix)
   * @returns The signature as r and s components (bigint)
   */
  signHash(hexHash: string): {r: bigint; s: bigint} {
    const hashBytes = hexToBytes(hexHash.replace('0x', ''));
    return this.sign(hashBytes);
  }

  /**
   * Gets the public key coordinates (x, y) for P-256.
   * These are used in the account's constructor calldata.
   */
  getPublicKey(): {x: Uint8Array; y: Uint8Array} {
    // publicKey format: 0x04 || x (32 bytes) || y (32 bytes)
    return {
      x: this.publicKey.slice(1, 33),
      y: this.publicKey.slice(33, 65),
    };
  }

  /**
   * Gets the public key X coordinate as a hex string (for Starknet).
   * Starknet WebAuthn accounts typically use just the X coordinate.
   */
  getPublicKeyX(): string {
    return '0x' + bytesToHex(this.publicKey.slice(1, 33));
  }

  /**
   * Gets the private key as a hex string.
   */
  getPrivateKeyHex(): string {
    return bytesToHex(this.privateKey);
  }

  /**
   * Gets the private key as raw bytes.
   */
  getPrivateKeyBytes(): Uint8Array {
    return this.privateKey;
  }
}

