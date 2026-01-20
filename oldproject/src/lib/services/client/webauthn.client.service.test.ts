import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WebauthnService } from './webauthn.client.service';
import { setupWebAuthnMocks } from '../../../test/mocks/webauthn';
import { TEST_FIXTURES } from '../../../test/utils/test-fixtures';
import { AuthService } from './auth.service';

// Mock dependencies
vi.mock('./auth.service');
vi.mock('$lib/utils/webauthn', () => ({
	createWebauthnAttestation: vi.fn(),
	requestSignature: vi.fn(),
	WebauthnOwner: vi.fn()
}));
vi.mock('$lib/utils/crypto', () => ({
	buf2hex: vi.fn((buf) => Array.from(buf, (byte) => byte.toString(16).padStart(2, '0')).join('')),
	buf2base64url: vi.fn((buf) =>
		btoa(String.fromCharCode(...new Uint8Array(buf)))
			.replace(/\+/g, '-')
			.replace(/\//g, '_')
			.replace(/=/g, '')
	),
	base64url2buf: vi.fn((base64url) => {
		const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
		const padLength = (4 - (base64.length % 4)) % 4;
		const padded = base64.padEnd(base64.length + padLength, '=');
		const binary = atob(padded);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i);
		}
		return bytes;
	})
}));
vi.mock('$lib/constants', () => ({
	TIMEOUTS: {
		WEBAUTHN_GET: 60000
	}
}));

describe('WebauthnService', () => {
	let webauthnService: WebauthnService;
	let webauthnMock: any;
	let authServiceMock: any;

	beforeEach(() => {
		// Reset singleton instance
		(WebauthnService as any).instance = undefined;

		// Setup WebAuthn mocks
		webauthnMock = setupWebAuthnMocks();
		webauthnMock.reset();

		// Setup auth service mock
		authServiceMock = {
			register: vi.fn().mockResolvedValue({ success: true })
		};
		vi.mocked(AuthService.getInstance).mockReturnValue(authServiceMock);

		webauthnService = WebauthnService.getInstance();
	});

	describe('getInstance', () => {
		it('should return a singleton instance', () => {
			const instance1 = WebauthnService.getInstance();
			const instance2 = WebauthnService.getInstance();
			expect(instance1).toBe(instance2);
		});
	});

	describe('createOwner', () => {
		it('should create a WebAuthn owner successfully', async () => {
			// Mock createWebauthnAttestation
			const mockAttestation = {
				origin: 'http://localhost:5173',
				rpId: 'localhost',
				credentialId: new Uint8Array([1, 2, 3, 4, 5]),
				pubKey: new Uint8Array([6, 7, 8, 9, 10])
			};

			const { createWebauthnAttestation, WebauthnOwner } = await import('$lib/utils/webauthn');
			vi.mocked(createWebauthnAttestation).mockResolvedValue(mockAttestation);
			vi.mocked(WebauthnOwner).mockReturnValue({} as any);

			const result = await webauthnService.createOwner(
				'localhost',
				'http://localhost:5173',
				'test@example.com'
			);

			expect(createWebauthnAttestation).toHaveBeenCalledWith(
				'localhost',
				'http://localhost:5173',
				'test@example.com'
			);
			const { buf2base64url } = await import('$lib/utils/crypto');
			expect(authServiceMock.register).toHaveBeenCalledWith({
				username: 'test@example.com',
				credentialId: buf2base64url(mockAttestation.credentialId.buffer),
				publicKey: buf2base64url(mockAttestation.pubKey.buffer)
			});
			expect(WebauthnOwner).toHaveBeenCalled();
		});

		it('should throw error when auth service registration fails', async () => {
			authServiceMock.register.mockResolvedValue({
				success: false,
				error: 'Registration failed'
			});

			const mockAttestation = {
				origin: 'http://localhost:5173',
				rpId: 'localhost',
				credentialId: new Uint8Array([1, 2, 3, 4, 5]),
				pubKey: new Uint8Array([6, 7, 8, 9, 10])
			};

			const { createWebauthnAttestation } = await import('$lib/utils/webauthn');
			vi.mocked(createWebauthnAttestation).mockResolvedValue(mockAttestation);

			await expect(
				webauthnService.createOwner('localhost', 'http://localhost:5173', 'test@example.com')
			).rejects.toThrow('Registration failed');
		});
	});

	describe('authenticateWithPasskey', () => {
		it('should authenticate successfully with valid credentials', async () => {
			const challenge = TEST_FIXTURES.credentialRequestOptions.publicKey.challenge;
			const mockCredential = webauthnMock.createCredential(TEST_FIXTURES.credentialCreationOptions);

			// Set up the mock to return our credential
			vi.mocked(navigator.credentials.get).mockResolvedValue(mockCredential);

			const result = await webauthnService.authenticateWithPasskey('localhost', challenge);

			expect(result).toHaveProperty('credentialId');
			expect(result).toHaveProperty('signature');
			expect(result).toHaveProperty('authenticatorData');
			expect(result).toHaveProperty('clientDataJSON');
			expect(navigator.credentials.get).toHaveBeenCalledWith({
				publicKey: {
					rpId: 'localhost',
					challenge: challenge,
					userVerification: 'required',
					timeout: 60000
				}
			});
		});

		it('should throw error when no credential is returned', async () => {
			const challenge = TEST_FIXTURES.credentialRequestOptions.publicKey.challenge;
			vi.mocked(navigator.credentials.get).mockResolvedValue(null);

			await expect(webauthnService.authenticateWithPasskey('localhost', challenge)).rejects.toThrow(
				'No passkey was selected'
			);
		});

		it('should handle NotAllowedError gracefully', async () => {
			const challenge = TEST_FIXTURES.credentialRequestOptions.publicKey.challenge;
			const error = new Error('Not allowed');
			error.name = 'NotAllowedError';
			vi.mocked(navigator.credentials.get).mockRejectedValue(error);

			await expect(webauthnService.authenticateWithPasskey('localhost', challenge)).rejects.toThrow(
				'Authentication was cancelled or timed out'
			);
		});

		it('should handle InvalidStateError gracefully', async () => {
			const challenge = TEST_FIXTURES.credentialRequestOptions.publicKey.challenge;
			const error = new Error('Invalid state');
			error.name = 'InvalidStateError';
			vi.mocked(navigator.credentials.get).mockRejectedValue(error);

			await expect(webauthnService.authenticateWithPasskey('localhost', challenge)).rejects.toThrow(
				'No passkeys found for this site'
			);
		});

		it('should handle SecurityError gracefully', async () => {
			const challenge = TEST_FIXTURES.credentialRequestOptions.publicKey.challenge;
			const error = new Error('Security error');
			error.name = 'SecurityError';
			vi.mocked(navigator.credentials.get).mockRejectedValue(error);

			await expect(webauthnService.authenticateWithPasskey('localhost', challenge)).rejects.toThrow(
				"Security error. Please ensure you're using HTTPS"
			);
		});

		it('should handle NotSupportedError gracefully', async () => {
			const challenge = TEST_FIXTURES.credentialRequestOptions.publicKey.challenge;
			const error = new Error('Not supported');
			error.name = 'NotSupportedError';
			vi.mocked(navigator.credentials.get).mockRejectedValue(error);

			await expect(webauthnService.authenticateWithPasskey('localhost', challenge)).rejects.toThrow(
				'Passkeys are not supported in this browser'
			);
		});
	});

	describe('createOwnerFromStoredCredentials', () => {
		it('should create owner from stored credentials', async () => {
			const { buf2base64url } = await import('$lib/utils/crypto');
			const credentialId = buf2base64url(TEST_FIXTURES.user.id.buffer);
			const publicKey = buf2base64url(new TextEncoder().encode('test-public-key').buffer);

			const { WebauthnOwner } = await import('$lib/utils/webauthn');
			vi.mocked(WebauthnOwner).mockReturnValue({} as any);

			const result = webauthnService.createOwnerFromStoredCredentials(
				'localhost',
				'http://localhost:5173',
				credentialId,
				publicKey
			);

			expect(WebauthnOwner).toHaveBeenCalledWith(
				{
					origin: 'http://localhost:5173',
					rpId: 'localhost',
					credentialId: TEST_FIXTURES.user.id,
					pubKey: new TextEncoder().encode('test-public-key')
				},
				expect.any(Function)
			);
		});
	});

	describe('base64ToUint8Array', () => {
		it('should convert base64url to Uint8Array correctly', () => {
			const { buf2base64url } = require('$lib/utils/crypto');
			const testData = new TextEncoder().encode('test');
			const base64url = buf2base64url(testData.buffer);
			const result = (webauthnService as any).base64ToUint8Array(base64url);

			expect(result).toBeInstanceOf(Uint8Array);
			expect(Array.from(result)).toEqual([116, 101, 115, 116]);
		});
	});
});
