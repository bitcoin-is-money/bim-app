import { describe, it, expect } from 'vitest';
import { setupWebAuthnMocks } from './mocks/webauthn';

describe('Testing Infrastructure Demo', () => {
	it('should run basic test', () => {
		expect(1 + 1).toBe(2);
	});

	it('should mock WebAuthn APIs', () => {
		setupWebAuthnMocks();
		expect(navigator.credentials.create).toBeDefined();
		expect(navigator.credentials.get).toBeDefined();
	});

	it('should mock crypto functions', () => {
		const randomBytes = crypto.getRandomValues(new Uint8Array(16));
		expect(randomBytes).toHaveLength(16);
	});

	it('should provide test fixtures', async () => {
		const { TEST_FIXTURES } = await import('./utils/test-fixtures');
		expect(TEST_FIXTURES.challenge).toBeDefined();
		expect(TEST_FIXTURES.rp).toBeDefined();
		expect(TEST_FIXTURES.user).toBeDefined();
	});
});
