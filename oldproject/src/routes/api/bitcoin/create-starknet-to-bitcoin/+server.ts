/**
 * @fileoverview Create Starknet→Bitcoin (on-chain) Swap API
 *
 * POST /api/bitcoin/create-starknet-to-bitcoin
 * Body: {
 *   sourceAsset: 'WBTC' | 'STRK' | 'ETH',
 *   starknetAddress: string,
 *   bitcoinAddress?: string,
 *   bitcoinUri?: string, // BIP-21 URI
 *   amountSats?: number, // optional BTC out amount in sats
 *   expirationMinutes?: number
 * }
 */

import { getAtomiqService } from '$lib/services/server/atomiq';
import {
	ApiErrorCode,
	createErrorResponse,
	createSuccessResponse,
	validateRequestBody,
	validators,
	withErrorHandling
} from '$lib/services/shared/api-response/index';
import { logger } from '$lib/utils/logger';
import type { RequestHandler } from './$types';

interface CreateStarknetToBitcoinRequest {
	sourceAsset: 'WBTC';
	starknetAddress: string;
	bitcoinAddress?: string;
	bitcoinUri?: string;
	amountSats?: number;
	expirationMinutes?: number;
}

interface CreateStarknetToBitcoinResponse {
	swapId: string;
	starknetAddress: string; // Deposit address on Starknet
	estimatedOutput: number; // sats
	fees: {
		network: number;
		swap: number;
		total: number;
	};
	expiresAt: string;
	status:
		| 'pending'
		| 'waiting_payment'
		| 'paid'
		| 'confirming'
		| 'completed'
		| 'failed'
		| 'expired';
}

const postHandler: RequestHandler = async ({ request }) => {
	const body: CreateStarknetToBitcoinRequest = await request.json();

	// Basic validation
	const validationErrors = validateRequestBody(body, ['sourceAsset', 'starknetAddress'], {
		sourceAsset: validators.supportedAsset,
		starknetAddress: validators.starknetAddress,
		expirationMinutes: body.expirationMinutes ? validators.range(1, 120) : undefined
	});

	if (validationErrors.length > 0) {
		return createErrorResponse(
			ApiErrorCode.VALIDATION_ERROR,
			'Request validation failed',
			undefined,
			validationErrors
		);
	}

	// Extract bitcoin address + optional amount from URI if provided
	let bitcoinAddress = body.bitcoinAddress;
	let amountSats = body.amountSats;

	if (body.bitcoinUri) {
		try {
			const url = new URL(body.bitcoinUri);
			if (url.protocol !== 'bitcoin:') {
				return createErrorResponse(
					ApiErrorCode.VALIDATION_ERROR,
					'Invalid BIP-21 URI: protocol must be bitcoin:'
				);
			}

			bitcoinAddress = url.pathname;
			const amount = url.searchParams.get('amount');
			if (amount && !amountSats) {
				const btc = parseFloat(amount);
				if (!isNaN(btc) && btc > 0) amountSats = Math.round(btc * 100_000_000);
			}
		} catch (e) {
			return createErrorResponse(ApiErrorCode.VALIDATION_ERROR, 'Invalid BIP-21 URI format');
		}
	}

	if (!bitcoinAddress) {
		return createErrorResponse(
			ApiErrorCode.VALIDATION_ERROR,
			'Bitcoin address or BIP-21 URI is required'
		);
	}

	// For Bitcoin on-chain swaps, amount is required by the SDK to compute commitments
	if (!amountSats || amountSats <= 0) {
		return createErrorResponse(
			ApiErrorCode.VALIDATION_ERROR,
			'Amount in satoshis is required for Bitcoin on-chain swaps. Include amount in the BIP-21 URI or provide amountSats.'
		);
	}

	logger.info('Creating Starknet→Bitcoin swap', {
		sourceAsset: body.sourceAsset,
		starknetAddress: body.starknetAddress?.substring(0, 10) + '...',
		bitcoinAddress: bitcoinAddress?.substring(0, 8) + '...',
		amountSats
	});

	const swap = await getAtomiqService().createStarknetToBitcoinSwap({
		sourceAsset: body.sourceAsset,
		starknetAddress: body.starknetAddress,
		bitcoinAddress,
		amountSats,
		expirationMinutes: body.expirationMinutes
	});

	const response: CreateStarknetToBitcoinResponse = {
		swapId: swap.swapId,
		starknetAddress: swap.starknetAddress,
		estimatedOutput: swap.estimatedOutput,
		fees: {
			network: swap.fees.fixed,
			swap: Math.max(0, Math.floor(swap.fees.total - swap.fees.fixed)),
			total: swap.fees.total
		},
		expiresAt: swap.expiresAt.toISOString(),
		status: swap.status
	};

	// Ensure the deposit address is a Starknet 0x address
	if (typeof response.starknetAddress !== 'string' || !response.starknetAddress.startsWith('0x')) {
		return createErrorResponse(
			ApiErrorCode.SERVICE_UNAVAILABLE,
			'Swap service returned an invalid deposit address (expected Starknet 0x address). Please retry.',
			{
				swapId: response.swapId,
				addressPreview:
					typeof response.starknetAddress === 'string'
						? `${response.starknetAddress.substring(0, 10)}...`
						: 'invalid'
			}
		);
	}

	return createSuccessResponse(response, {
		requestId: crypto.randomUUID(),
		timestamp: new Date().toISOString()
	});
};

export const POST = withErrorHandling(postHandler, '/api/bitcoin/create-starknet-to-bitcoin');
