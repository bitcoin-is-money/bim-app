/**
 * Blockchain Constants
 * Centralized configuration for contract addresses, networks, and blockchain-related settings
 */

// Contract Class Hashes
export const CONTRACT_CLASS_HASHES = {
	ARGENT_040_ACCOUNT: '0x036078334509b514626504edc9fb252328d1a240e4e948bef8d0c08dff45927f',
	BIM_ARGENT_050_ACCOUNT: '0x04bc5b0950521985d3f8db954fc6ae3832122c6ee4cd770efdbf87437699ce48'
} as const;

// Network Configuration
export const NETWORKS = {
	LOCALHOST: {
		name: 'localhost',
		chainId: 'SN_MAIN',
		rpcUrl: 'http://localhost:5050'
	}
} as const;

// Supported Assets
export const SUPPORTED_ASSETS = ['WBTC'] as const;

// Starknet-specific constants
export const STARKNET_CONFIG = {
	SUPPORTED_CURRENCIES: ['WBTC'] as const,
	NETWORK_NAME: 'Starknet'
} as const;

// Gas Tokens
export const GAS_TOKENS = {
	STRK: '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d'
} as const;

// Token Contract Addresses
export const TOKEN_ADDRESSES = {
	WBTC: '0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac'
} as const;

// Lightning Network Configuration
export const LIGHTNING_CONFIG = {
	MIN_AMOUNT_SATS: 1_000, // 1,000 satoshis minimum
	MAX_AMOUNT_SATS: 1_000_000, // 1M satoshis maximum
	DAILY_VOLUME_LIMIT: 10_000_000, // 10M satoshis daily limit
	CONFIRMATION_BLOCKS: 1,
	EXPIRY_BLOCKS: 144 // ~24 hours
} as const;

// Transaction Configuration
export const TRANSACTION_CONFIG = {
	DEFAULT_MAX_FEE: '0x38d7ea4c68000', // 0.001 ETH in wei
	MULTICALL_GAS_LIMIT: 800_000,
	DEPLOY_GAS_LIMIT: 1_500_000,
	MAX_RETRY_ATTEMPTS: 3,
	MAX_L2_GAS_LIMIT: 100_000_000, // Increased limit for complex Lightning transactions (was 2_113_280)
	LIGHTNING_GAS_MULTIPLIER: 60, // 60x multiplier for Lightning transactions (was 25, needs ~54x minimum)
	COMPLEX_TRANSACTION_THRESHOLD: 2 // Transactions with 2+ calls are considered complex
} as const;

// WebAuthn Configuration
export const WEBAUTHN_CONFIG = {
	CHALLENGE_SIZE: 32,
	USER_ID_SIZE: 32,
	RP_NAME: 'BIM3 WebAuthn Wallet',
	// RP_ID is now dynamically loaded from environment variables
	// Use PublicEnv.WEBAUTHN_RP_ID() to get the current value
	AUTHENTICATOR_SELECTION: {
		requireResidentKey: false,
		userVerification: 'preferred' as const,
		authenticatorAttachment: 'platform' as const
	}
} as const;

// Fee Configuration
export const FEE_CONFIG = {
	// Fee percentage: 0.1% (0.001 as decimal)
	PERCENTAGE: 0.001,
	// Fee recipient address (configurable Starknet address)
	RECIPIENT_ADDRESS: '0x027367ddd36d7efc4694e1af5742f8d26626369c07abf15d136ff422b9a40fa0'
} as const;

// Event Selectors
export const EVENT_SELECTORS = {
	// ERC-20 Transfer event selector (keccak256 of "Transfer(from,to,value)")
	ERC20_TRANSFER: '0x99cd8bde557814842a3121e8ddfd433a539b8c9f14bf31ebf108d12e6196e9'
} as const;

// Type definitions
export type NetworkName = keyof typeof NETWORKS;
export type SupportedAsset = (typeof SUPPORTED_ASSETS)[number];
