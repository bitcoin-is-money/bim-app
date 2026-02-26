import {p256} from '@noble/curves/p256';
import {sha256} from '@noble/hashes/sha256';
import {cose, isoBase64URL, isoCBOR} from '@simplewebauthn/server/helpers';
import {randomBytes} from 'node:crypto';
import {P256Signer} from '../crypto/p256-signer.js';

/**
 * Encodes bytes to base64url string using native Node.js Buffer.
 * This avoids issues with toBase64Url on certain input types.
 */
function toBase64Url(data: Uint8Array | Buffer): string {
  return Buffer.from(data).toString('base64url');
}

/**
 * Credential stored by the virtual authenticator.
 */
export interface StoredCredential {
  credentialId: Uint8Array;
  signer: P256Signer;
  publicKey: Uint8Array; // COSE-encoded (RFC 8152 standard using CBOR)
  rpId: string;
  userHandle: Uint8Array;
  signCount: number;
}

/**
 * Options for VirtualAuthenticator constructor.
 */
export interface VirtualAuthenticatorOptions {
  /**
   * When provided, all credentials will use this signer's key pair.
   * This enables deterministic testing.
   */
  signer?: P256Signer;
}

/**
 * Registration credential returned by createCredential.
 */
export interface RegistrationCredential {
  id: string; // base64url
  rawId: string; // base64url
  response: {
    clientDataJSON: string; // base64url
    attestationObject: string; // base64url
  };
  type: 'public-key';
  clientExtensionResults: Record<string, unknown>;
}

/**
 * Authentication credential returned by getAssertion.
 */
export interface AuthenticationCredential {
  id: string; // base64url
  rawId: string; // base64url
  response: {
    clientDataJSON: string; // base64url
    authenticatorData: string; // base64url
    signature: string; // base64url
    userHandle: string; // base64url
  };
  type: 'public-key';
  clientExtensionResults: Record<string, unknown>;
}

/**
 * Options for credential creation (subset of WebAuthn spec).
 */
export interface CredentialCreationOptions {
  challenge: string; // base64url
  rp: {
    id: string;
    name: string;
  };
  user: {
    id: string; // base64url
    name: string;
    displayName: string;
  };
  origin?: string; // Optional origin override (default: https://{rp.id})
}

/**
 * Options for assertion (subset of WebAuthn spec).
 */
export interface CredentialRequestOptions {
  challenge: string; // base64url
  rpId: string;
  allowCredentials?: Array<{
    id: string; // base64url
    type: 'public-key';
  }>;
  origin?: string; // Optional origin override (default: https://{rpId})
}

/**
 * Virtual WebAuthn authenticator for integration testing.
 *
 * This class simulates a hardware authenticator (like a YubiKey or Touch ID):
 * - Generates real P-256 key pairs (or uses a deterministic signer)
 * - Creates valid CBOR-encoded attestation objects
 * - Signs authentication challenges with real ECDSA signatures
 * - Stores credentials in memory
 *
 * The credentials it produces can be verified by the real SimpleWebAuthnGateway,
 * allowing end-to-end testing without browser/hardware involvement.
 *
 * When constructed with a P256Signer, all credentials use the same deterministic
 * key pair, enabling DevnetPaymasterGateway to sign deployment transactions.
 */
export class WebauthnVirtualAuthenticator {
  private readonly credentials: Map<string, StoredCredential> = new Map();
  private readonly signer: P256Signer | undefined;

  // AAGUID for our virtual authenticator (all zeros = no attestation)
  private static readonly AAGUID = new Uint8Array(16);

  constructor(options?: VirtualAuthenticatorOptions) {
    this.signer = options?.signer;
  }

  /**
   * Creates a new credential for WebAuthn registration.
   *
   * This simulates navigator.credentials.create() in the browser.
   */
  async createCredential(options: CredentialCreationOptions): Promise<RegistrationCredential> {
    // Generate a random credential ID (32 bytes)
    const credentialIdBuffer = randomBytes(32);
    const credentialId = new Uint8Array(credentialIdBuffer);
    // Use Buffer's native base64url encoding
    const credentialIdBase64 = credentialIdBuffer.toString('base64url');

    // Use the provided signer or generate a new one
    const credentialSigner = this.signer ?? P256Signer.generate();
    const {x, y} = credentialSigner.getPublicKey();

    // Encode public key in COSE format (required by WebAuthn)
    const cosePublicKey = this.encodeCosePublicKey(x, y);

    // Build authenticator data
    const rpIdHash = sha256(new TextEncoder().encode(options.rp.id));
    const flags = 0x45; // UP (user present) + UV (user verified) + AT (attested credential)
    const signCount = 0;

    const authenticatorData = this.buildAuthenticatorData(
      rpIdHash,
      flags,
      signCount,
      credentialId,
      cosePublicKey,
    );

    // Build client data JSON
    const origin = options.origin ?? `https://${options.rp.id}`;
    const clientData = {
      type: 'webauthn.create',
      challenge: options.challenge,
      origin,
      crossOrigin: false,
    };
    const clientDataJSON = Buffer.from(JSON.stringify(clientData));

    // Build attestation object (using "none" attestation for simplicity)
    // Must use Map because isoCBOR.encode requires Maps, not plain objects
    const attestationObjectMap = new Map<string, string | Map<string, string> | Uint8Array<ArrayBufferLike>>();
    attestationObjectMap.set('fmt', 'none');
    attestationObjectMap.set('attStmt', new Map());
    attestationObjectMap.set('authData', authenticatorData);
    const attestationObject = isoCBOR.encode(attestationObjectMap);

    // Store the credential
    const userHandle = isoBase64URL.toBuffer(options.user.id);
    this.credentials.set(credentialIdBase64, {
      credentialId,
      signer: credentialSigner,
      publicKey: cosePublicKey,
      rpId: options.rp.id,
      userHandle,
      signCount: 0,
    });

    return {
      id: credentialIdBase64,
      rawId: credentialIdBase64,
      response: {
        clientDataJSON: toBase64Url(clientDataJSON),
        attestationObject: toBase64Url(attestationObject),
      },
      type: 'public-key',
      clientExtensionResults: {},
    };
  }

  /**
   * Gets an assertion for WebAuthn authentication.
   *
   * This simulates navigator.credentials.get() in the browser.
   */
  async getAssertion(options: CredentialRequestOptions): Promise<AuthenticationCredential> {
    // Find a matching credential
    let credential: StoredCredential | undefined;
    let credentialIdBase64: string | undefined;

    if (options.allowCredentials && options.allowCredentials.length > 0) {
      // Use specified credential
      for (const allowed of options.allowCredentials) {
        const found = this.credentials.get(allowed.id);
        if (found && found.rpId === options.rpId) {
          credential = found;
          credentialIdBase64 = allowed.id;
          break;
        }
      }
    } else {
      // Find any credential for this RP
      for (const [id, cred] of this.credentials) {
        if (cred.rpId === options.rpId) {
          credential = cred;
          credentialIdBase64 = id;
          break;
        }
      }
    }

    if (!credential || !credentialIdBase64) {
      throw new Error(`No credential found for rpId: ${options.rpId}`);
    }

    // Increment sign count
    credential.signCount++;

    // Build authenticator data (no attested credential data for assertions)
    const rpIdHash = sha256(new TextEncoder().encode(options.rpId));
    const flags = 0x05; // UP (user present) + UV (user verified)

    const authenticatorData = this.buildAuthenticatorData(
      rpIdHash,
      flags,
      credential.signCount,
    );

    // Build client data JSON
    const origin = options.origin ?? `https://${options.rpId}`;
    const clientData = {
      type: 'webauthn.get',
      challenge: options.challenge,
      origin,
      crossOrigin: false,
    };
    const clientDataJSON = Buffer.from(JSON.stringify(clientData));

    // Create signature over authenticatorData || SHA-256(clientDataJSON)
    const clientDataHash = sha256(clientDataJSON);
    const signedData = new Uint8Array(authenticatorData.length + clientDataHash.length);
    signedData.set(authenticatorData);
    signedData.set(clientDataHash, authenticatorData.length);

    // Hash the data and sign (WebAuthn uses SHA-256 + ECDSA)
    const dataHash = sha256(signedData);
    const sig = p256.sign(dataHash, credential.signer.getPrivateKeyBytes(), {lowS: true});
    // WebAuthn/SimpleWebAuthn expects DER-encoded signature for ES256
    const signature = sig.toDERRawBytes();

    return {
      id: credentialIdBase64,
      rawId: credentialIdBase64,
      response: {
        clientDataJSON: toBase64Url(clientDataJSON),
        authenticatorData: toBase64Url(authenticatorData),
        signature: toBase64Url(signature),
        userHandle: toBase64Url(credential.userHandle),
      },
      type: 'public-key',
      clientExtensionResults: {},
    };
  }

  /**
   * Gets all stored credentials.
   */
  getStoredCredentials(): StoredCredential[] {
    return Array.from(this.credentials.values());
  }

  /**
   * Gets a credential by ID.
   */
  getCredential(credentialId: string): StoredCredential | undefined {
    return this.credentials.get(credentialId);
  }

  /**
   * Clears all stored credentials.
   */
  clear(): void {
    this.credentials.clear();
  }

  /**
   * Encodes a P-256 public key in COSE format.
   */
  private encodeCosePublicKey(x: Uint8Array, y: Uint8Array): Uint8Array {
    // COSE Key format for EC2 (P-256):
    // {
    //   1: 2,      // kty: EC2
    //   3: -7,     // alg: ES256
    //   -1: 1,     // crv: P-256
    //   -2: x,     // x coordinate
    //   -3: y,     // y coordinate
    // }
    const coseKey = new Map<number, number | Uint8Array>();
    coseKey.set(cose.COSEKEYS.kty, cose.COSEKTY.EC2);
    coseKey.set(cose.COSEKEYS.alg, cose.COSEALG.ES256);
    coseKey.set(cose.COSEKEYS.crv, cose.COSECRV.P256);
    coseKey.set(cose.COSEKEYS.x, x);
    coseKey.set(cose.COSEKEYS.y, y);

    return isoCBOR.encode(coseKey);
  }

  /**
   * Builds authenticator data.
   *
   * Format:
   * - rpIdHash (32 bytes)
   * - flags (1 byte)
   * - signCount (4 bytes, big-endian)
   * - [attestedCredentialData] (variable, only if AT the flag is set)
   */
  private buildAuthenticatorData(
    rpIdHash: Uint8Array,
    flags: number,
    signCount: number,
    credentialId?: Uint8Array,
    cosePublicKey?: Uint8Array,
  ): Uint8Array {
    const parts: Uint8Array[] = [
      rpIdHash,
      new Uint8Array([flags]),
      this.uint32BE(signCount),
    ];

    // Add attested credential data if present (for registration)
    if (credentialId && cosePublicKey) {
      parts.push(
        WebauthnVirtualAuthenticator.AAGUID, // AAGUID (16 bytes)
        this.uint16BE(credentialId.length), // credential ID length (2 bytes)
        credentialId, // credential ID
        cosePublicKey, // COSE public key
      );
    }

    // Concatenate all parts
    const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of parts) {
      result.set(part, offset);
      offset += part.length;
    }
    return result;
  }

  private uint32BE(value: number): Uint8Array {
    const buf = new Uint8Array(4);
    buf[0] = (value >>> 24) & 0xff;
    buf[1] = (value >>> 16) & 0xff;
    buf[2] = (value >>> 8) & 0xff;
    buf[3] = value & 0xff;
    return buf;
  }

  private uint16BE(value: number): Uint8Array {
    const buf = new Uint8Array(2);
    buf[0] = (value >>> 8) & 0xff;
    buf[1] = value & 0xff;
    return buf;
  }
}
