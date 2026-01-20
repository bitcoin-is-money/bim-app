/**
 * Server-side WebAuthn utilities for address calculation and verification
 * These functions work without browser APIs and don't require signing capabilities
 */

import { sha256 as jssha256 } from 'js-sha256';
import { CairoOption, CairoOptionVariant, CallData, shortString, uint256 } from 'starknet';
import { ServerStarknetService } from '../../services/server/starknet.server.service';
import { buf2hex, hex2buf } from '../crypto';
import { SignerType, signerTypeToCustomEnum } from '../starknet/signer-types';
import type { WebauthnCredentialData } from './WebauthnCredentialData';
import { buildArgentConstructorCalldataFromWebauthn } from '../starknet/argent-calldata';

function sha256(message: any): Uint8Array {
	return hex2buf(jssha256(message));
}

const toCharArray = (value: string) =>
	CallData.compile(value.split('').map(shortString.encodeShortString));

/**
 * Calculate account address using WebAuthn credential data (server-safe)
 * This function works without browser APIs and doesn't require signing capabilities
 */
export function calculateWebauthnAccountAddress(
	classHash: string,
	credentialData: WebauthnCredentialData,
	addressSalt: bigint = 12n
): string {
	// Calculate rpId hash
	const rpIdHash = uint256.bnToUint256(buf2hex(sha256(credentialData.rpId)));

	// Build constructor calldata manually to guarantee correct discriminant ordering
	const constructorCalldata = buildArgentConstructorCalldataFromWebauthn({
		origin: toCharArray(credentialData.origin),
		rp_id_hash: rpIdHash,
		pubkey: uint256.bnToUint256(buf2hex(credentialData.pubKey))
	});

	// Calculate contract address using Starknet's formula
	return ServerStarknetService.calculateContractAddress(
		addressSalt,
		classHash,
		constructorCalldata,
		0
	);
}

/**
 * Create signer data for server-side operations
 * Returns the raw signer data that can be used in server contexts
 */
export function createWebauthnSignerData(credentialData: WebauthnCredentialData) {
	const rpIdHash = uint256.bnToUint256(buf2hex(sha256(credentialData.rpId)));

	return {
		rp_id_hash: rpIdHash,
		origin: toCharArray(credentialData.origin)
	};
}
