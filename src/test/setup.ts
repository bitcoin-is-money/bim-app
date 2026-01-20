import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Svelte 5 compatibility setup
if (typeof globalThis !== 'undefined') {
	// Mock Svelte 5 DOM environment
	globalThis.HTMLElement = globalThis.HTMLElement || class {};
	globalThis.SVGElement = globalThis.SVGElement || class {};

	// Force Svelte to think we're in a browser environment
	globalThis.window = globalThis.window || globalThis;
	globalThis.document = globalThis.document || {
		createElement: () => ({}),
		createElementNS: () => ({}),
		createTextNode: () => ({}),
		createComment: () => ({}),
		createDocumentFragment: () => ({})
	};
}

// Mock environment variables
vi.mock('$env/dynamic/public', () => ({
	env: {
		PUBLIC_STARKNET_NETWORK: 'mainnet',
		PUBLIC_RPC_URL: 'https://starknet-mainnet.public.blastapi.io/rpc/v0_8',
		PUBLIC_APP_NAME: 'BIM3 Test',
		PUBLIC_APP_URL: 'http://localhost:5173'
	}
}));

// Mock constants
vi.mock('$lib/constants', () => ({
	CONTRACT_CLASS_HASHES: {
		ARGENTX_ACCOUNT: '0x036078334509b514626504edc9fb252328d1a240e4e948bef8d0c08dff45927f',
		WEBAUTHN_MULTICALL: '0x07b0b8ecf3e6a88b2e7d7f9f2c4a3e5d8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c'
	},
	NETWORKS: {
		MAINNET: {
			name: 'mainnet',
			chainId: 'SN_MAIN',
			rpcUrl: 'https://starknet-mainnet.public.blastapi.io/rpc/v0_8'
		}
	},
	SUPPORTED_ASSETS: ['WBTC'],
	WEBAUTHN_CONFIG: {
		CHALLENGE_SIZE: 32,
		USER_ID_SIZE: 32,
		RP_NAME: 'BIM3 Test',
		RP_ID: 'localhost',
		AUTHENTICATOR_SELECTION: {
			requireResidentKey: false,
			userVerification: 'preferred',
			authenticatorAttachment: 'platform'
		}
	},
	TIMEOUTS: {
		WEBAUTHN_GET: 60000,
		WEBAUTHN_CREATE: 60000,
		NETWORK_REQUEST: 30000
	}
}));

// Mock browser environment
vi.mock('$app/environment', () => ({
	browser: true,
	dev: true,
	building: false
}));

// Mock SvelteKit stores
vi.mock('$app/stores', () => ({
	page: {
		subscribe: vi.fn((callback) => {
			callback({
				url: new URL('http://localhost:5173'),
				params: {},
				route: { id: '/' },
				data: {}
			});
			return () => {};
		})
	},
	navigating: {
		subscribe: vi.fn((callback) => {
			callback(null);
			return () => {};
		})
	},
	updated: {
		subscribe: vi.fn((callback) => {
			callback(false);
			return () => {};
		})
	}
}));

// Mock AuthService and other services
vi.mock('$lib/services/client/auth.service', () => ({
	AuthService: {
		getInstance: vi.fn(() => ({
			register: vi.fn().mockResolvedValue({ success: true }),
			login: vi.fn().mockResolvedValue({ success: true }),
			logout: vi.fn().mockResolvedValue({ success: true }),
			getUser: vi.fn().mockReturnValue(null),
			isAuthenticated: vi.fn().mockReturnValue(false)
		}))
	}
}));

// Mock Lightning Service
vi.mock('$lib/services/client/lightning.client.service', () => ({
	LightningService: {
		getInstance: vi.fn(() => ({
			deployAccount: vi.fn().mockResolvedValue({
				success: true,
				accountAddress: '0x1234567890abcdef1234567890abcdef12345678',
				transactionHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
			}),
			createInvoice: vi.fn().mockResolvedValue({ success: true }),
			getSwapStatus: vi.fn().mockResolvedValue({ status: 'completed' })
		}))
	}
}));

// Mock Starknet Service
vi.mock('$lib/services/client/starknet.client.service', () => ({
	StarknetService: {
		getInstance: vi.fn(() => ({
			getAccount: vi.fn().mockReturnValue(null),
			deployAccount: vi.fn().mockResolvedValue({ success: true }),
			executeTransaction: vi.fn().mockResolvedValue({ success: true })
		}))
	}
}));

// Mock service index
vi.mock('$lib/services', () => ({
	WebauthnService: {
		getInstance: vi.fn(() => ({
			createOwner: vi.fn().mockResolvedValue({
				guid: 123n,
				publicKey: 456n
			})
		}))
	},
	StarknetService: {
		getInstance: vi.fn(() => ({
			getAccount: vi.fn().mockReturnValue(null),
			deployAccount: vi.fn().mockResolvedValue({ success: true })
		}))
	},
	AuthService: {
		getInstance: vi.fn(() => ({
			register: vi.fn().mockResolvedValue({ success: true }),
			login: vi.fn().mockResolvedValue({ success: true }),
			logout: vi.fn().mockResolvedValue({ success: true }),
			getUser: vi.fn().mockReturnValue(null),
			isAuthenticated: vi.fn().mockReturnValue(false)
		}))
	}
}));

// Mock WebAuthn API
Object.defineProperty(global, 'navigator', {
	value: {
		credentials: {
			create: vi.fn(),
			get: vi.fn(),
			store: vi.fn(),
			preventSilentAccess: vi.fn()
		}
	},
	writable: true
});

// Mock crypto.getRandomValues
Object.defineProperty(global, 'crypto', {
	value: {
		getRandomValues: vi.fn((arr) => {
			for (let i = 0; i < arr.length; i++) {
				arr[i] = Math.floor(Math.random() * 256);
			}
			return arr;
		})
	},
	writable: true
});

// Mock PublicKeyCredential
global.PublicKeyCredential = Object.assign(vi.fn(), {
	getClientCapabilities: vi.fn().mockResolvedValue({}),
	isConditionalMediationAvailable: vi.fn().mockResolvedValue(false),
	isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true),
	parseCreationOptionsFromJSON: vi.fn(),
	parseRequestOptionsFromJSON: vi.fn()
});
global.AuthenticatorAttestationResponse = vi.fn();
global.AuthenticatorAssertionResponse = vi.fn();
