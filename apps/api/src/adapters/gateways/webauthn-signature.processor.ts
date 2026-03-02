import type {WebAuthnAssertion} from '@bim/domain/payment';
import {Base64Url} from '@bim/lib/encoding';
// @noble/curves v1 import — pinned due to @noble/hashes 1.8.0 override (starknet compat)
// TODO: when upgrading to v2, change to: '@noble/curves/nist.js'
/* eslint-disable @typescript-eslint/no-deprecated */
import {p256} from '@noble/curves/p256';
import {sha256} from '@noble/hashes/sha2';
import {bytesToHex, concatBytes} from '@noble/hashes/utils';
import {uint256} from 'starknet';

// =============================================================================
// Configuration
// =============================================================================

export interface WebAuthnSignatureConfig {
  /** WebAuthn origin (e.g. "https://app.bim.com") */
  origin: string;
  /** WebAuthn RP ID (e.g. "app.bim.com") */
  rpId: string;
}

const TEXT_ENCODER = new TextEncoder();

// =============================================================================
// Processor
// =============================================================================

/**
 * Processes raw WebAuthn assertion responses into Argent compact_no_legacy
 * signature format for use with AVNU PaymasterRpc.executeTransaction().
 *
 * The compact_no_legacy format includes both the signer identity (WebAuthn
 * key info) and the ECDSA signature, flattened into a single string array.
 */
export class WebAuthnSignatureProcessor {
  private readonly rpIdHash: Uint8Array;
  private readonly originBytes: Uint8Array;

  constructor(private readonly config: WebAuthnSignatureConfig) {
    this.rpIdHash = sha256(config.rpId);
    this.originBytes = TEXT_ENCODER.encode(config.origin);
  }

  /**
   * Converts a raw WebAuthn assertion into Argent compact_no_legacy signature.
   *
   * @param assertion - Base64url-encoded WebAuthn assertion response fields
   * @param publicKeyHex - Account's P-256 X-coordinate (0x-prefixed 64-char hex)
   * @returns String array in compact_no_legacy format for PaymasterRpc
   */
  process(assertion: WebAuthnAssertion, publicKeyHex: string): string[] {
    // 1. Decode base64url fields
    const authenticatorData = Base64Url.decode(assertion.authenticatorData);
    const clientDataJSON = Base64Url.decode(assertion.clientDataJSON);
    const signatureBytes = Base64Url.decode(assertion.signature);

    // 2. Extract authenticator data fields (flags at byte 32, sign count at bytes 33-36)
    const flags = authenticatorData[32] ?? 0;
    const signCount = new DataView(authenticatorData.buffer, authenticatorData.byteOffset, authenticatorData.byteLength).getUint32(33);

    // 3. Parse DER signature + normalize to low-S
    const rawSig = p256.Signature.fromDER(signatureBytes);
    const needsFlip = rawSig.hasHighS();
    const sig = needsFlip ? rawSig.normalizeS() : rawSig;

    // 4. Compute y_parity via public key recovery
    const messageHash = sha256(concatBytes(authenticatorData, sha256(clientDataJSON)));
    let yParity = computeYParity(messageHash, BigInt(publicKeyHex), rawSig);
    if (needsFlip) yParity = !yParity;

    // 5. Extract clientDataJsonOutro (Argent-specific)
    const outro = extractClientDataJsonOutro(clientDataJSON);

    // 6. Build compact_no_legacy format
    return this.buildCompactNoLegacy(publicKeyHex, outro, flags, signCount, sig.r, sig.s, yParity);
  }

  /**
   * Builds Argent compact_no_legacy signature layout:
   * [1, 0x4, originLen, ...originBytes, rpLow, rpHigh, pkLow, pkHigh,
   *  outroLen, ...outroBytes, flags, signCount, rLow, rHigh, sLow, sHigh, yParity]
   */
  private buildCompactNoLegacy(
    publicKeyHex: string, outro: Uint8Array,
    flags: number, signCount: number,
    r: bigint, s: bigint, yParity: boolean,
  ): string[] {
    const rpU256 = uint256.bnToUint256('0x' + bytesToHex(this.rpIdHash));
    const pkU256 = uint256.bnToUint256(publicKeyHex);
    const rU256 = uint256.bnToUint256(r);
    const sU256 = uint256.bnToUint256(s);

    return [
      '1',                                              // signatures_len
      '0x4',                                            // signer variant = Webauthn
      toHexFelt(this.originBytes.length),               // origin_len
      ...Array.from(this.originBytes, toHexFelt),       // origin bytes
      rpU256.low.toString(),                            // rp_id_hash.low
      rpU256.high.toString(),                           // rp_id_hash.high
      pkU256.low.toString(),                            // pubkey.low
      pkU256.high.toString(),                           // pubkey.high
      toHexFelt(outro.length),                          // client_data_json_outro_len
      ...Array.from(outro, toHexFelt),                  // client_data_json_outro bytes
      toHexFelt(flags),                                 // authenticator flags
      toHexFelt(signCount),                             // sign counter
      rU256.low.toString(),                             // ec_signature.r.low
      rU256.high.toString(),                            // ec_signature.r.high
      sU256.low.toString(),                             // ec_signature.s.low
      sU256.high.toString(),                            // ec_signature.s.high
      yParity ? '0x1' : '0x0',                         // ec_signature.y_parity
    ];
  }
}

// =============================================================================
// Internal helpers
// =============================================================================

/**
 * Recovers y_parity by trying both recovery IDs and checking which
 * produces the expected public key X-coordinate.
 * Must be called with the RAW (pre-normalization) signature.
 */
function computeYParity(messageHash: Uint8Array, pubkeyX: bigint, sig: InstanceType<typeof p256.Signature>): boolean {
  for (const bit of [0, 1] as const) {
    const recovered = sig.addRecoveryBit(bit).recoverPublicKey(messageHash);
    if (pubkeyX === recovered.x) return bit === 1;
  }
  throw new Error('Could not determine y_parity: neither recovery ID matches the public key');
}

/**
 * Extracts the "outro" from clientDataJSON — the bytes after the origin value's
 * closing quote. Required by Argent's WebAuthn signature verification.
 *
 * clientDataJSON: {"type":"webauthn.get","challenge":"...","origin":"https://...",...}
 * The outro is everything after the closing quote of the origin value.
 */
function extractClientDataJsonOutro(clientDataJSON: Uint8Array): Uint8Array {
  const originKey = TEXT_ENCODER.encode('"origin":"');
  const keyIndex = indexOfSubarray(clientDataJSON, originKey);
  if (keyIndex === -1) return new Uint8Array();

  // Scan past origin key to find the closing quote of the origin value
  let i = keyIndex + originKey.length;
  // eslint-disable-next-line security/detect-object-injection -- numeric index on Uint8Array
  while (i < clientDataJSON.length && clientDataJSON[i] !== 0x22 /* '"' */) i++;
  if (i >= clientDataJSON.length) return new Uint8Array();

  const outro = clientDataJSON.slice(i + 1);
  // If outro is just '}', treat as empty per Argent spec
  return (outro.length === 1 && outro[0] === 0x7d) ? new Uint8Array() : outro;
}

function indexOfSubarray(haystack: Uint8Array, needle: Uint8Array): number {
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      // eslint-disable-next-line security/detect-object-injection -- numeric index on Uint8Array
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function toHexFelt(n: number): string {
  return '0x' + n.toString(16);
}
