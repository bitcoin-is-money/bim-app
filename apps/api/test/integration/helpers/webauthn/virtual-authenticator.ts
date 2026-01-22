import {createHash, createSign, generateKeyPairSync, randomBytes} from 'node:crypto';
import {cose, isoCBOR, isoBase64URL} from '@simplewebauthn/server/helpers';

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
  privateKey: string; // PEM format
  publicKey: Uint8Array; // COSE-encoded
  rpId: string;
  userHandle: Uint8Array;
  signCount: number;
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
 * - Generates real P-256 key pairs
 * - Creates valid CBOR-encoded attestation objects
 * - Signs authentication challenges with real ECDSA signatures
 * - Stores credentials in memory
 *
 * The credentials it produces can be verified by the real SimpleWebAuthnGateway,
 * allowing end-to-end testing without browser/hardware involvement.
 */
export class VirtualAuthenticator {
  private readonly credentials: Map<string, StoredCredential> = new Map();

  // AAGUID for our virtual authenticator (all zeros = no attestation)
  private static readonly AAGUID = new Uint8Array(16);

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

    // Generate P-256 key pair
    const {publicKey, privateKey} = generateKeyPairSync('ec', {
      namedCurve: 'P-256',
      publicKeyEncoding: {type: 'spki', format: 'der'},
      privateKeyEncoding: {type: 'pkcs8', format: 'pem'},
    });

    // Extract raw public key coordinates from SPKI DER format
    const {x, y} = this.extractP256Coordinates(publicKey as Buffer);

    // Encode public key in COSE format (required by WebAuthn)
    const cosePublicKey = this.encodeCosePublicKey(x, y);

    // Build authenticator data
    const rpIdHash = createHash('sha256').update(options.rp.id).digest();
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
      privateKey: privateKey as string,
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
    const rpIdHash = createHash('sha256').update(options.rpId).digest();
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
    const clientDataHash = createHash('sha256').update(clientDataJSON).digest();
    const signedData = Buffer.concat([authenticatorData, clientDataHash]);

    const sign = createSign('SHA256');
    sign.update(signedData);
    // Keep signature in DER format (WebAuthn/SimpleWebAuthn expects DER for ES256)
    const signature = sign.sign(credential.privateKey);

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
   * Extracts X and Y coordinates from a P-256 SPKI DER public key.
   */
  private extractP256Coordinates(spkiDer: Buffer): {x: Uint8Array; y: Uint8Array} {
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
      x: new Uint8Array(spkiDer.slice(pointStart + 1, pointStart + 33)),
      y: new Uint8Array(spkiDer.slice(pointStart + 33, pointStart + 65)),
    };
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
   * - [attestedCredentialData] (variable, only if AT flag set)
   */
  private buildAuthenticatorData(
    rpIdHash: Buffer,
    flags: number,
    signCount: number,
    credentialId?: Uint8Array,
    cosePublicKey?: Uint8Array,
  ): Uint8Array {
    const parts: Buffer[] = [
      rpIdHash,
      Buffer.from([flags]),
      this.uint32BE(signCount),
    ];

    // Add attested credential data if present (for registration)
    if (credentialId && cosePublicKey) {
      parts.push(
        Buffer.from(VirtualAuthenticator.AAGUID), // AAGUID (16 bytes)
        this.uint16BE(credentialId.length), // credential ID length (2 bytes)
        Buffer.from(credentialId), // credential ID
        Buffer.from(cosePublicKey), // COSE public key
      );
    }

    return Buffer.concat(parts);
  }

  private uint32BE(value: number): Buffer {
    const buf = Buffer.alloc(4);
    buf.writeUInt32BE(value, 0);
    return buf;
  }

  private uint16BE(value: number): Buffer {
    const buf = Buffer.alloc(2);
    buf.writeUInt16BE(value, 0);
    return buf;
  }
}
