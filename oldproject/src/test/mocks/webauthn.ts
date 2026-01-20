import { vi } from 'vitest';

export interface MockCredential {
	id: string;
	rawId: ArrayBuffer;
	type: 'public-key';
	response: MockAuthenticatorAttestationResponse | MockAuthenticatorAssertionResponse;
}

export interface MockAuthenticatorAttestationResponse {
	clientDataJSON: ArrayBuffer;
	attestationObject: ArrayBuffer;
}

export interface MockAuthenticatorAssertionResponse {
	clientDataJSON: ArrayBuffer;
	authenticatorData: ArrayBuffer;
	signature: ArrayBuffer;
	userHandle: ArrayBuffer | null;
}

export class WebAuthnMock {
	private static instance: WebAuthnMock;
	private credentialStore = new Map<string, MockCredential>();

	static getInstance(): WebAuthnMock {
		if (!WebAuthnMock.instance) {
			WebAuthnMock.instance = new WebAuthnMock();
		}
		return WebAuthnMock.instance;
	}

	createCredential(options: CredentialCreationOptions): MockCredential {
		const id = this.generateCredentialId();
		const rawId = new TextEncoder().encode(id);

		const clientData = {
			type: 'webauthn.create',
			challenge: options.publicKey?.challenge,
			origin: 'http://localhost:5173'
		};

		const credential: MockCredential = {
			id,
			rawId: rawId.buffer.slice(0),
			type: 'public-key',
			response: {
				clientDataJSON: new TextEncoder().encode(JSON.stringify(clientData)).buffer.slice(0),
				attestationObject: this.createMockAttestationObject().buffer.slice(0)
			}
		};

		this.credentialStore.set(id, credential);
		return credential;
	}

	getCredential(options: CredentialRequestOptions): MockCredential | null {
		const allowCredentials = options.publicKey?.allowCredentials;
		if (!allowCredentials || allowCredentials.length === 0) {
			return null;
		}

		const credentialId = new TextDecoder().decode(allowCredentials[0]?.id || new ArrayBuffer(0));
		const storedCredential = this.credentialStore.get(credentialId);

		if (!storedCredential) {
			return null;
		}

		const clientData = {
			type: 'webauthn.get',
			challenge: options.publicKey?.challenge,
			origin: 'http://localhost:5173'
		};

		return {
			...storedCredential,
			response: {
				clientDataJSON: new TextEncoder().encode(JSON.stringify(clientData)).buffer.slice(0),
				authenticatorData: this.createMockAuthenticatorData().buffer.slice(0),
				signature: this.createMockSignature().buffer.slice(0),
				userHandle: new TextEncoder().encode('test-user').buffer.slice(0)
			}
		};
	}

	private generateCredentialId(): string {
		return 'test-credential-' + Math.random().toString(36).substring(2);
	}

	private createMockAttestationObject(): ArrayBuffer {
		// Simplified mock attestation object
		const attestation = {
			fmt: 'none',
			attStmt: {},
			authData: this.createMockAuthenticatorData()
		};
		return new TextEncoder().encode(JSON.stringify(attestation)).buffer.slice(0);
	}

	private createMockAuthenticatorData(): ArrayBuffer {
		// 37 bytes minimum for authenticator data
		const authData = new Uint8Array(37);
		// RP ID hash (32 bytes)
		authData.set(crypto.getRandomValues(new Uint8Array(32)), 0);
		// Flags (1 byte) - UP=1, UV=1, AT=1
		authData[32] = 0x45;
		// Counter (4 bytes)
		authData.set([0, 0, 0, 1], 33);
		return authData.buffer;
	}

	private createMockSignature(): ArrayBuffer {
		// Mock ECDSA signature (64 bytes for P-256)
		return crypto.getRandomValues(new Uint8Array(64)).buffer;
	}

	reset(): void {
		this.credentialStore.clear();
	}
}

export function setupWebAuthnMocks() {
	const mock = WebAuthnMock.getInstance();

	global.navigator.credentials.create = vi
		.fn()
		.mockImplementation((options: CredentialCreationOptions) => {
			return Promise.resolve(mock.createCredential(options));
		});

	global.navigator.credentials.get = vi
		.fn()
		.mockImplementation((options: CredentialRequestOptions) => {
			const credential = mock.getCredential(options);
			return Promise.resolve(credential);
		});

	return mock;
}
