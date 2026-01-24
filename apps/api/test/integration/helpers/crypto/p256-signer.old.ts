import {createSign, createPublicKey, createPrivateKey} from 'node:crypto';

/**
 * Deterministic P-256 signer for testing.
 *
 * This class provides a hardcoded P-256 key pair that is used consistently
 * across all test components:
 * - VirtualAuthenticator: for WebAuthn credential creation and assertions
 * - DevnetPaymasterGateway: for signing DEPLOY_ACCOUNT transactions
 *
 * Using the same key ensures that signatures are valid because they match
 * the public key stored in the account's constructor.
 */
export class P256Signer {
  /**
   * Hardcoded P-256 private key for deterministic testing.
   * Generated once and kept constant for reproducibility.
   *
   * IMPORTANT: This key is for TESTING ONLY. Never use in production.
   */
  private static readonly PRIVATE_KEY_PEM = `-----BEGIN EC PRIVATE KEY-----
MHcCAQEEIFxhGkxWCyfSEk038KFkD+ewRpDLf7NFMU51+lmUGYbGoAoGCCqGSM49
AwEHoUQDQgAEOx7GZuM6ojh4LG9eBY7e8Frs4KrlPDJ08MEFLGy6DT9zxTzxbUHG
PM0KWZgjdJ2vr8Q2QZ57/wvliaNLddNGig==
-----END EC PRIVATE KEY-----`;

  private readonly privateKey: ReturnType<typeof createPrivateKey>;
  private readonly publicKeyCoordinates: {x: Uint8Array; y: Uint8Array};

  constructor() {
    this.privateKey = createPrivateKey(P256Signer.PRIVATE_KEY_PEM);
    this.publicKeyCoordinates = this.extractPublicKeyCoordinates();
  }

  /**
   * Signs data with the P-256 private key.
   *
   * @param data - The data to sign (typically a hash)
   * @returns The signature as r and s components (bigint)
   */
  sign(data: Buffer): {r: bigint; s: bigint} {
    const sign = createSign('SHA256');
    sign.update(data);
    const derSignature = sign.sign(this.privateKey);
    return this.derToRS(derSignature);
  }

  /**
   * Signs a hex-encoded hash (like a Starknet transaction hash).
   *
   * @param hexHash - The hash to sign (with or without 0x prefix)
   * @returns The signature as r and s components (bigint)
   */
  signHash(hexHash: string): {r: bigint; s: bigint} {
    const hashBuffer = Buffer.from(hexHash.replace('0x', ''), 'hex');
    return this.sign(hashBuffer);
  }

  /**
   * Gets the public key coordinates (x, y) for P-256.
   * These are used in the account's constructor calldata.
   */
  getPublicKey(): {x: Uint8Array; y: Uint8Array} {
    return this.publicKeyCoordinates;
  }

  /**
   * Gets the public key X coordinate as a hex string (for Starknet).
   * Starknet WebAuthn accounts typically use just the X coordinate.
   */
  getPublicKeyX(): string {
    const xHex = Buffer.from(this.publicKeyCoordinates.x).toString('hex');
    return '0x' + xHex;
  }

  /**
   * Gets the private key in PEM format.
   * Used by VirtualAuthenticator for WebAuthn signing.
   */
  getPrivateKeyPem(): string {
    return P256Signer.PRIVATE_KEY_PEM;
  }

  /**
   * Extracts the X and Y coordinates from the public key.
   */
  private extractPublicKeyCoordinates(): {x: Uint8Array; y: Uint8Array} {
    const publicKey = createPublicKey(this.privateKey);
    const spkiDer = publicKey.export({type: 'spki', format: 'der'});

    // SPKI format for P-256:
    // SEQUENCE {
    //   SEQUENCE { OID, OID }  -- algorithm identifier
    //   BIT STRING { 04 || x || y }  -- uncompressed point
    // }
    // The uncompressed point starts at a fixed offset for P-256
    const pointStart = spkiDer.length - 65; // 65 = 1 (0x04) + 32 (x) + 32 (y)
    if (spkiDer[pointStart] !== 0x04) {
      throw new Error('Expected uncompressed point format (0x04)');
    }

    return {
      x: new Uint8Array(spkiDer.subarray(pointStart + 1, pointStart + 33)),
      y: new Uint8Array(spkiDer.subarray(pointStart + 33, pointStart + 65)),
    };
  }

  /**
   * Converts a DER-encoded ECDSA signature to r and s components.
   */
  private derToRS(derSignature: Buffer): {r: bigint; s: bigint} {
    // DER format: 0x30 [length] 0x02 [r-length] [r] 0x02 [s-length] [s]
    let offset = 2; // Skip 0x30 and total length

    // Read r
    if (derSignature[offset] !== 0x02) {
      throw new Error('Invalid DER signature: expected 0x02 for r');
    }
    offset++;
    const rLength = derSignature[offset];
    if (rLength === undefined) {
      throw new Error('Invalid DER signature: missing r length');
    }
    offset++;
    const rBytes = derSignature.subarray(offset, offset + rLength);
    offset += rLength;

    // Read s
    if (derSignature[offset] !== 0x02) {
      throw new Error('Invalid DER signature: expected 0x02 for s');
    }
    offset++;
    const sLength = derSignature[offset];
    if (sLength === undefined) {
      throw new Error('Invalid DER signature: missing s length');
    }
    offset++;
    const sBytes = derSignature.subarray(offset, offset + sLength);

    // Convert to bigint, handling leading zeros
    const r = BigInt('0x' + Buffer.from(rBytes).toString('hex'));
    const s = BigInt('0x' + Buffer.from(sBytes).toString('hex'));

    return {r, s};
  }
}

/**
 * Singleton instance for consistent key usage across tests.
 */
let sharedSigner: P256Signer | undefined;

/**
 * Gets the shared P256Signer instance.
 * All test components should use this to ensure consistent keys.
 */
export function getSharedP256Signer(): P256Signer {
  if (!sharedSigner) {
    sharedSigner = new P256Signer();
  }
  return sharedSigner;
}

/**
 * Resets the shared signer (for test isolation if needed).
 */
export function resetSharedP256Signer(): void {
  sharedSigner = undefined;
}
