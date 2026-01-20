import { describe, it, expect } from 'vitest';
import { CallData, CairoCustomEnum } from 'starknet';
import { signerTypeToCustomEnum, SignerType } from '../src/lib/utils/starknet';

describe('WebAuthn signature compilation', () => {
	it('places sha256_implementation as the final felt', () => {
		const signature = {
			signer: {
				origin: [1],
				rp_id_hash: { low: 1, high: 0 },
				pubkey: '0x1'
			},
			signature: {
				cross_origin: 1,
				client_data_json_outro: [1, 2],
				flags: 2,
				sign_count: 3,
				ec_signature: {
					r: { low: 4, high: 5 },
					s: { low: 6, high: 7 },
					y_parity: 1
				},
				sha256_implementation: new CairoCustomEnum({ Cairo0: {} })
			}
		};

		const compiled = CallData.compile([
			signerTypeToCustomEnum(SignerType.Webauthn, {
				signer: signature.signer,
				signature: signature.signature
			})
		]);

		const formatted = ['1', ...compiled];

		expect(formatted[0]).toBe('1');
		expect(formatted[formatted.length - 1]).toBe('0');
	});
});
