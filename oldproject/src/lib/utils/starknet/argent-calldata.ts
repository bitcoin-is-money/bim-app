import type { Uint256 } from 'starknet';

// Minimal shape we expect from a WebAuthn signer payload
export interface RawWebauthnSignerLike {
	// Either a string origin or a precompiled array of u8 felt values
	origin: string | (string | number | bigint)[];
	rp_id_hash: Uint256;
	pubkey: Uint256;
}

/**
 * Convert origin into an array of ASCII byte values (felt-compatible).
 */
function toAsciiByteArray(
	origin: string | (string | number | bigint)[]
): (string | number | bigint)[] {
	if (Array.isArray(origin)) return origin;
	return origin.split('').map((c) => c.charCodeAt(0));
}

/**
 * Build constructor calldata for Argent account with a WebAuthn owner.
 * Matches Cairo enum Signer::Webauthn layout:
 *   [variant_index=4, origin_len, ...origin_bytes, rp.low, rp.high, pk.low, pk.high, guardian=None(1)]
 */
export function buildArgentConstructorCalldataFromWebauthn(
	signerLike: RawWebauthnSignerLike
): (string | number | bigint)[] {
	const originBytes = toAsciiByteArray(signerLike.origin);

	// Cairo enum discriminant for Signer::Webauthn is 4
	const VARIANT_WEBAUTHN = 4;

	// Guardian is Option::None => tag 1 (per starknet.js CairoOptionVariant.None)
	const OPTION_NONE = 1;

	const calldata: (string | number | bigint)[] = [];
	// owner: Signer::Webauthn
	calldata.push(VARIANT_WEBAUTHN);
	calldata.push(originBytes.length);
	calldata.push(...originBytes);
	calldata.push(signerLike.rp_id_hash.low);
	calldata.push(signerLike.rp_id_hash.high);
	calldata.push(signerLike.pubkey.low);
	calldata.push(signerLike.pubkey.high);
	// guardian: Option::None
	calldata.push(OPTION_NONE);
	return calldata;
}
