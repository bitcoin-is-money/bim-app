import { concatBytes } from '@noble/curves/utils.js';
import { p256 as secp256r1 } from '@noble/curves/nist.js';
import { ECDSASigValue } from '@peculiar/asn1-ecc';
import { AsnParser } from '@peculiar/asn1-schema';
import {
	CairoCustomEnum,
	CallData,
	hash,
	shortString,
	uint256,
	type ArraySignatureType,
	type BigNumberish,
	type Uint256
} from 'starknet';

import { buf2hex, hex2buf } from '../crypto';
import { KeyPair, SignerType, signerTypeToCustomEnum } from '../starknet/signer-types';
import type { WebauthnAttestation } from './WebauthnAttestation';

import { sha256 as jssha256 } from 'js-sha256';

function sha256(message: any): Uint8Array {
	return hex2buf(jssha256(message));
}

const normalizeTransactionHash = (transactionHash: string) =>
	transactionHash.replace(/^0x/, '').padStart(64, '0');
const findInArray = (dataToFind: Uint8Array, arrayToIterate: Uint8Array) => {
	return arrayToIterate.findIndex((_element, i) => {
		const slice = arrayToIterate.slice(i, i + dataToFind.length);
		return dataToFind.toString() === slice.toString();
	});
};

// Extract everything that comes after the closing quote of the `origin` value
// in the Client Data JSON, as required by Argent's WebAuthn spec.
function extractClientDataJsonOutro(clientDataJson: Uint8Array, _origin: string): Uint8Array {
	const encoder = new TextEncoder();
	const originKey = encoder.encode('"origin":"');
	const keyIndex = findInArray(originKey, clientDataJson);
	if (keyIndex === -1) {
		return new Uint8Array();
	}
	const valueStart = keyIndex + originKey.length;
	// scan forward to the next '"' marking the end of the origin value
	let i = valueStart;
	while (i < clientDataJson.length && clientDataJson[i] !== 0x22 /* '"' */) {
		i++;
	}
	if (i >= clientDataJson.length) {
		return new Uint8Array();
	}
	const outro = clientDataJson.slice(i + 1);
	// If outro is just '}', treat as empty per spec
	if (outro.length === 1 && outro[0] === 0x7d /* '}' */) {
		return new Uint8Array();
	}
	return outro;
}
export type NormalizedSecpSignature = {
	r: bigint;
	s: bigint;
	yParity: boolean;
};

export function normalizeSecpR1Signature(signature: {
	r: bigint;
	s: bigint;
	recovery: number;
}): NormalizedSecpSignature {
	return normalizeSecpSignature(secp256r1, signature);
}

export function normalizeSecpSignature(
	curve: typeof secp256r1,
	signature: { r: bigint; s: bigint; recovery: number }
): NormalizedSecpSignature {
	let s = signature.s;
	let yParity = signature.recovery !== 0;
	const curveOrder = curve.Point.CURVE().n;
	if (s > curveOrder / 2n) {
		s = curveOrder - s;
		yParity = !yParity;
	}
	return { r: signature.r, s, yParity };
}

const toCharArray = (value: string) =>
	CallData.compile(value.split('').map(shortString.encodeShortString));

/**
 * Flattens a WebAuthn signature into a format compatible with Argent Cairo contracts
 * Based on the Argent WebauthnSignature struct: {client_data_json_outro, flags, sign_count, ec_signature}
 */
function flattenWebAuthnSignature(signature: WebauthnSignature): string[] {
	const flattened: string[] = [];

	// Add client_data_json_outro as individual elements
	flattened.push(...signature.client_data_json_outro.map((byte) => `0x${byte.toString(16)}`));

	// Add flags as single element
	flattened.push(`0x${signature.flags.toString(16)}`);

	// Add sign_count as single element
	flattened.push(`0x${signature.sign_count.toString(16)}`);

	// Add ec_signature components (r.low, r.high, s.low, s.high, y_parity)
	flattened.push(signature.ec_signature.r.low.toString());
	flattened.push(signature.ec_signature.r.high.toString());
	flattened.push(signature.ec_signature.s.low.toString());
	flattened.push(signature.ec_signature.s.high.toString());
	flattened.push(signature.ec_signature.y_parity ? '0x1' : '0x0');

	return flattened;
}

interface WebauthnSignature {
	client_data_json_outro: BigNumberish[];
	flags: number;
	sign_count: number;
	ec_signature: { r: Uint256; s: Uint256; y_parity: boolean };
}

export interface WebauthnSigner {
	origin: BigNumberish[];
	rp_id_hash: Uint256;
	pubkey: Uint256;
}

export class WebauthnOwner extends KeyPair {
	attestation: WebauthnAttestation;
	requestSignature?: (
		attestation: WebauthnAttestation,
		challenge: Uint8Array
	) => Promise<AuthenticatorAssertionResponse>;
	rpIdHash: Uint256;
	crossOrigin = false;
	private isServerSide: boolean;

	constructor(
		attestation: WebauthnAttestation,
		requestSignature?: (
			attestation: WebauthnAttestation,
			challenge: Uint8Array
		) => Promise<AuthenticatorAssertionResponse>
	) {
		super();
		this.attestation = attestation;
		if (requestSignature) {
			this.requestSignature = requestSignature;
		}
		this.rpIdHash = uint256.bnToUint256(buf2hex(sha256(attestation.rpId)));
		this.isServerSide = typeof window === 'undefined' || !requestSignature;
	}

	public get publicKey() {
		// Use only the X-coordinate (32 bytes) as per Argent's approach
		// This matches their example: return BigInt(buf2hex(this.attestation.pubKey));
		return BigInt(buf2hex(this.attestation.pubKey));
	}

	public get guid(): bigint {
		const rpIdHashAsU256 = this.rpIdHash;
		const publicKeyAsU256 = uint256.bnToUint256(this.publicKey);
		const originBytes = toCharArray(this.attestation.origin);
		const elements = [
			shortString.encodeShortString('Webauthn Signer'),
			originBytes.length,
			...originBytes,
			rpIdHashAsU256.low,
			rpIdHashAsU256.high,
			publicKeyAsU256.low,
			publicKeyAsU256.high
		];
		return BigInt(hash.computePoseidonHashOnElements(elements));
	}

	public get storedValue(): bigint {
		return this.guid;
	}

	public get signerType(): SignerType {
		return SignerType.Webauthn;
	}

	public get signer(): CairoCustomEnum {
		const signer: WebauthnSigner = {
			origin: toCharArray(this.attestation.origin),
			rp_id_hash: this.rpIdHash,
			pubkey: uint256.bnToUint256(this.publicKey)
		};
		return signerTypeToCustomEnum(this.signerType, signer);
	}

	public async signRaw(messageHash: string): Promise<ArraySignatureType> {
		if (this.isServerSide || !this.requestSignature) {
			throw new Error(
				'WebAuthn signing is not available on server-side. Use client-side WebauthnOwner for signing operations.'
			);
		}

		// Modern WebAuthn challenge: use the 32-byte message hash only (no extra implementation byte)
		const challenge = hex2buf(normalizeTransactionHash(messageHash));

		const assertionResponse = await this.requestSignature(this.attestation, challenge);
		const authenticatorData = new Uint8Array(assertionResponse.authenticatorData);
		const clientDataJson = new Uint8Array(assertionResponse.clientDataJSON);
		const flags = authenticatorData[32];
		const signCount = Number(BigInt(buf2hex(authenticatorData.slice(33, 37))));
		console.log('clientDataJson', new TextDecoder().decode(clientDataJson));
		console.log('flags', flags);
		console.log('signCount', signCount);

		// Extract exact bytes after origin closing quote (covers both with/without crossOrigin)
		let clientDataJsonOutro = extractClientDataJsonOutro(clientDataJson, this.attestation.origin);
		console.log('🔎 WebAuthn outro (signRaw):', {
			length: clientDataJsonOutro.length,
			firstBytes: Array.from(clientDataJsonOutro.slice(0, 16))
		});

		let { r, s } = parseASN1Signature(assertionResponse.signature);
		let yParity = getYParity(
			getMessageHash(authenticatorData, clientDataJson),
			this.publicKey,
			r,
			s
		);

		const normalizedSignature = normalizeSecpR1Signature({
			r,
			s,
			recovery: yParity ? 1 : 0
		});
		r = normalizedSignature.r;
		s = normalizedSignature.s;
		yParity = normalizedSignature.yParity;

		const signature: WebauthnSignature = {
			client_data_json_outro: Array.from(clientDataJsonOutro),
			flags: flags || 0,
			sign_count: signCount,
			ec_signature: {
				r: uint256.bnToUint256(r),
				s: uint256.bnToUint256(s),
				y_parity: yParity
			}
		};

		const flattenedSignature = flattenWebAuthnSignature(signature);

		console.log('🔍 DEBUG: WebauthnOwner final signature creation:', {
			messageHash,
			webauthnSignature: signature,
			signatureFields: {
				client_data_json_outro: signature.client_data_json_outro.length,
				flags: signature.flags,
				sign_count: signature.sign_count,
				ec_signature: signature.ec_signature
			},
			flattenedSignature: flattenedSignature,
			flattenedLength: flattenedSignature.length
		});

		console.log('WebauthnOwner signed, signature is:', signature);
		console.log('WebauthnOwner flattened signature:', flattenedSignature);
		return flattenedSignature;
	}

	getClientData(challenge: Uint8Array): any {
		return { type: 'webauthn.get', challenge, origin: this.attestation.origin };
	}

	/**
	 * Get the raw WebAuthn signature object before compilation
	 * This allows access to the ec_signature.r and ec_signature.s values
	 * for conversion to StarkNet signature format
	 */
	public async getRawSignature(messageHash: string): Promise<WebauthnSignature> {
		if (this.isServerSide || !this.requestSignature) {
			throw new Error(
				'WebAuthn signing is not available on server-side. Use client-side WebauthnOwner for signing operations.'
			);
		}

		// Modern WebAuthn challenge: use the 32-byte message hash only (no extra implementation byte)
		const challenge = hex2buf(normalizeTransactionHash(messageHash));
		const assertionResponse = await this.requestSignature(this.attestation, challenge);
		const authenticatorData = new Uint8Array(assertionResponse.authenticatorData);
		const clientDataJson = new Uint8Array(assertionResponse.clientDataJSON);
		const flags = authenticatorData[32];
		const signCount = Number(BigInt(buf2hex(authenticatorData.slice(33, 37))));

		// Extract exact bytes after origin closing quote (covers both with/without crossOrigin)
		let clientDataJsonOutro = extractClientDataJsonOutro(clientDataJson, this.attestation.origin);
		console.log('🔎 WebAuthn outro (getRawSignature):', {
			length: clientDataJsonOutro.length,
			firstBytes: Array.from(clientDataJsonOutro.slice(0, 16))
		});

		let { r, s } = parseASN1Signature(assertionResponse.signature);
		let yParity = getYParity(
			getMessageHash(authenticatorData, clientDataJson),
			this.publicKey,
			r,
			s
		);

		const normalizedSignature = normalizeSecpR1Signature({
			r,
			s,
			recovery: yParity ? 1 : 0
		});
		r = normalizedSignature.r;
		s = normalizedSignature.s;
		yParity = normalizedSignature.yParity;

		const signature: WebauthnSignature = {
			client_data_json_outro: Array.from(clientDataJsonOutro),
			flags: flags || 0,
			sign_count: signCount,
			ec_signature: {
				r: uint256.bnToUint256(r),
				s: uint256.bnToUint256(s),
				y_parity: yParity
			}
		};

		console.log('WebauthnOwner raw signature (before compilation):', signature);
		return signature;
	}
}

/**
 * In WebAuthn, EC2 signatures are wrapped in ASN.1 structure so we need to peel r and s apart.
 *
 * See https://www.w3.org/TR/webauthn-2/#sctn-signature-attestation-types
 */
const parseASN1Signature = (asn1Signature: BufferSource) => {
	const signature = AsnParser.parse(asn1Signature, ECDSASigValue);
	console.log('parseASN1Signature', signature);
	let r = new Uint8Array(signature.r);
	let s = new Uint8Array(signature.s);
	const shouldRemoveLeadingZero = (bytes: Uint8Array): boolean =>
		bytes[0] === 0x0 && bytes[1] !== undefined && (bytes[1] & (1 << 7)) !== 0;
	if (shouldRemoveLeadingZero(r)) {
		r = r.slice(1);
	}
	if (shouldRemoveLeadingZero(s)) {
		s = s.slice(1);
	}
	return {
		r: BigInt(buf2hex(r)),
		s: BigInt(buf2hex(s))
	};
};

const getMessageHash = (authenticatorData: Uint8Array, clientDataJson: Uint8Array) => {
	const clientDataHash = sha256(clientDataJson);
	const message = concatBytes(authenticatorData, clientDataHash);
	return sha256(message);
};

const getYParity = (messageHash: Uint8Array, pubkey: bigint, r: bigint, s: bigint) => {
	const signature = new secp256r1.Signature(r, s);

	const recoveredEven = signature.addRecoveryBit(0).recoverPublicKey(messageHash);
	if (pubkey === recoveredEven.x) {
		return false;
	}
	const recoveredOdd = signature.addRecoveryBit(1).recoverPublicKey(messageHash);
	if (pubkey === recoveredOdd.x) {
		return true;
	}
	throw new Error('Could not determine y_parity');
};
