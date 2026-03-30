import {sha256} from '@noble/hashes/sha2';

/**
 * Splits a 256-bit hex value into two 128-bit felt strings (low, high).
 * Input: 0x-prefixed 64-char hex string.
 */
function toU256(hex256: string): {low: string; high: string} {
  const value = BigInt(hex256);
  const low = value & ((1n << 128n) - 1n);
  const high = value >> 128n;
  return {
    low: '0x' + low.toString(16),
    high: '0x' + high.toString(16),
  };
}

/**
 * Converts a number to a 0x-prefixed hex string (Starknet felt format).
 */
function toHexFelt(n: number): string {
  return '0x' + n.toString(16);
}

/**
 * Converts a string to an array of ASCII byte values.
 */
function toAsciiByteArray(str: string): number[] {
  return [...str].map(c => {
    const code = c.codePointAt(0);
    if (code === undefined) {
      throw new Error('Unexpected empty character');
    }
    return code;
  });
}

/**
 * Builds the constructor calldata for an Argent account with a WebAuthn owner.
 *
 * Matches Cairo enum `Signer::Webauthn` serialization:
 * ```
 * [variant_index=4, origin_len, ...origin_bytes,
 *  rp_id_hash_low, rp_id_hash_high,
 *  pubkey_low, pubkey_high,
 *  guardian=Option::None(1)]
 * ```
 *
 * @param params :
 * - origin - WebAuthn origin (e.g. "http://localhost:8080")
 * - rpId - WebAuthn RP ID (e.g. "localhost") — will be SHA-256 hashed
 * - publicKey - P256 X-coordinate as 0x-prefixed 64-char hex (full 256-bit, NOT reduced mod STARK_PRIME)
 */
export function buildArgentWebauthnCalldata(params: {
  origin: string;
  rpId: string;
  publicKey: string;
}): string[] {
  const originBytes = toAsciiByteArray(params.origin);
  const rpIdHash = '0x' + Buffer.from(sha256(params.rpId)).toString('hex');
  const rpIdU256 = toU256(rpIdHash);
  const pubkeyU256 = toU256(params.publicKey);
  const VARIANT_WEBAUTHN = 4;
  const OPTION_NONE = 1; // Option::None in Cairo
  const calldata: string[] = [
    toHexFelt(VARIANT_WEBAUTHN), // owner: Signer::Webauthn
    toHexFelt(originBytes.length)
  ];
  for (const byte of originBytes) {
    calldata.push(toHexFelt(byte));
  }
  calldata.push(
    rpIdU256.low,
    rpIdU256.high,
    pubkeyU256.low,
    pubkeyU256.high,
    toHexFelt(OPTION_NONE) // guardian: Option::None
  );
  return calldata;
}

/**
 * The constant salt used for Argent WebAuthn account deployment.
 * Matches the old project's `addressSalt = 12n`.
 */
export const ARGENT_WEBAUTHN_SALT = '0xc';
