/**
 * @fileoverview Database Schema Definitions for WebAuthn Starknet Application
 *
 * This module defines the complete database schema for the WebAuthn-based
 * Starknet account deployment application using Drizzle ORM. The schema
 * supports secure user authentication and session management.
 *
 * Schema Design:
 * - User table: Stores WebAuthn credentials and user data
 * - Session table: Manages user sessions with expiration
 * - Type-safe TypeScript interfaces for all operations
 * - Proper foreign key relationships and cascade behaviors
 * - UUID-based primary keys for security
 *
 * Security Features:
 * - Unique constraints on usernames and credential IDs
 * - Cascade deletion for data integrity
 * - Timestamp tracking for audit trails
 * - WebAuthn-specific credential storage
 *
 * @requires drizzle-orm/pg-core - Drizzle ORM PostgreSQL core
 *
 * @author bim
 * @version 1.0.0
 */

import { pgTable, text, timestamp, uuid, bigint, boolean } from 'drizzle-orm/pg-core';

/**
 * Users table schema
 *
 * Stores user account information and WebAuthn credentials for authentication.
 * This table is the core of the user management system and contains all
 * necessary data for WebAuthn-based authentication.
 *
 * Fields:
 * - id: UUID primary key for user identification
 * - username: Human-readable unique identifier
 * - credentialId: WebAuthn credential identifier (base64url encoded)
 * - publicKey: WebAuthn public key for signature verification
 * - createdAt: Account creation timestamp
 * - updatedAt: Last modification timestamp
 *
 * Constraints:
 * - Username must be unique across all users
 * - Credential ID must be unique (WebAuthn requirement)
 * - All core fields are required (NOT NULL)
 *
 * @example
 * ```typescript
 * // Create a new user
 * const newUser: NewUser = {
 *   username: 'alice',
 *   credentialId: 'base64url-encoded-credential-id',
 *   publicKey: 'base64url-encoded-public-key'
 * };
 *
 * await db.insert(users).values(newUser);
 * ```
 */
export const users = pgTable('users', {
	/** UUID primary key with automatic generation */
	id: uuid('id').primaryKey().defaultRandom(),

	/** Human-readable unique username */
	username: text('username').notNull().unique(),

	/** WebAuthn credential identifier (base64url encoded) */
	credentialId: text('credential_id').notNull().unique(),

	/** WebAuthn public key for signature verification (base64url encoded) */
	publicKey: text('public_key').notNull(),

	/** COSE-encoded credential public key for SimpleWebAuthn verification */
	credentialPublicKey: text('credential_public_key'),

	/** WebAuthn sign counter for replay protection */
	signCount: bigint('webauthn_sign_count', { mode: 'number' }).default(0),

	/** Registered RP ID for this credential (e.g., domain) */
	rpId: text('rp_id'),

	/** Account creation timestamp */
	createdAt: timestamp('created_at').defaultNow().notNull(),

	/** Last modification timestamp */
	updatedAt: timestamp('updated_at').defaultNow().notNull()
});

/**
 * Sessions table schema
 *
 * Manages user authentication sessions with expiration tracking.
 * This table enables secure session management with automatic cleanup
 * of expired sessions.
 *
 * Fields:
 * - id: Text-based session identifier (UUID format)
 * - userId: Foreign key reference to users table
 * - expiresAt: Session expiration timestamp
 * - createdAt: Session creation timestamp
 *
 * Relationships:
 * - Each session belongs to exactly one user
 * - User deletion cascades to all their sessions
 * - Sessions automatically expire based on expiresAt
 *
 * @example
 * ```typescript
 * // Create a new session
 * const newSession: NewSession = {
 *   id: 'session-uuid',
 *   userId: 'user-uuid',
 *   expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
 * };
 *
 * await db.insert(sessions).values(newSession);
 * ```
 */
export const sessions = pgTable('sessions', {
	/** Text-based session identifier (UUID format) */
	id: text('id').primaryKey(),

	/** Foreign key reference to users table with cascade deletion */
	userId: uuid('user_id')
		.references(() => users.id, { onDelete: 'cascade' })
		.notNull(),

	/** Session expiration timestamp */
	expiresAt: timestamp('expires_at').notNull(),

	/** Session creation timestamp */
	createdAt: timestamp('created_at').defaultNow().notNull()
});

/**
 * WebAuthn Challenges table schema
 *
 * Stores short-lived, single-use challenges for registration and authentication
 * ceremonies to prevent replay and enforce origin/RP validation.
 */
export const webauthnChallenges = pgTable('webauthn_challenges', {
	/** UUID primary key with automatic generation */
	id: uuid('id').primaryKey().defaultRandom(),

	/** Base64url-encoded challenge string */
	challenge: text('challenge').notNull(),

	/** Purpose of the challenge: 'registration' | 'authentication' */
	purpose: text('purpose').notNull(),

	/** Optional user association (known for auth, unknown for registration) */
	userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),

	/** RP ID and Origin captured at issuance for validation context */
	rpId: text('rp_id'),
	origin: text('origin'),

	/** Single-use control */
	used: boolean('used').default(false).notNull(),

	/** Expiration to enforce short-lived challenges */
	expiresAt: timestamp('expires_at').notNull(),

	/** Audit fields */
	createdAt: timestamp('created_at').defaultNow().notNull()
});

/**
 * User Settings table schema
 *
 * Stores user-specific preferences and configuration settings.
 * This table maintains a one-to-one relationship with users and
 * allows for personalized application behavior.
 *
 * Fields:
 * - id: UUID primary key for settings record
 * - userId: Foreign key reference to users table (unique)
 * - fiatCurrency: User's preferred fiat currency for display
 * - createdAt: Settings creation timestamp
 * - updatedAt: Last modification timestamp
 *
 * Relationships:
 * - Each user has exactly one settings record
 * - User deletion cascades to their settings
 * - Settings are auto-created on user registration
 *
 * @example
 * ```typescript
 * // Create user settings
 * const newSettings: NewUserSettings = {
 *   userId: 'user-uuid',
 *   fiatCurrency: 'EUR'
 * };
 *
 * await db.insert(userSettings).values(newSettings);
 * ```
 */
export const userSettings = pgTable('user_settings', {
	/** UUID primary key with automatic generation */
	id: uuid('id').primaryKey().defaultRandom(),

	/** Foreign key reference to users table with unique constraint */
	userId: uuid('user_id')
		.references(() => users.id, { onDelete: 'cascade' })
		.notNull()
		.unique(),

	/** User's preferred fiat currency (USD, EUR, GBP, etc.) */
	fiatCurrency: text('fiat_currency').notNull().default('USD'),

	/** Settings creation timestamp */
	createdAt: timestamp('created_at').defaultNow().notNull(),

	/** Last modification timestamp */
	updatedAt: timestamp('updated_at').defaultNow().notNull()
});

/**
 * TypeScript type definitions for type-safe database operations
 *
 * These types are automatically inferred from the schema definitions
 * and provide compile-time type safety for all database operations.
 *
 * Types:
 * - User: Complete user record for SELECT operations
 * - NewUser: User data for INSERT operations (excludes auto-generated fields)
 * - Session: Complete session record for SELECT operations
 * - NewSession: Session data for INSERT operations (excludes auto-generated fields)
 * - UserSettings: Complete user settings record for SELECT operations
 * - NewUserSettings: User settings data for INSERT operations (excludes auto-generated fields)
 */

/** User record type for SELECT operations */
export type User = typeof users.$inferSelect;

/** User data type for INSERT operations */
export type NewUser = typeof users.$inferInsert;

/** Session record type for SELECT operations */
export type Session = typeof sessions.$inferSelect;

/** Session data type for INSERT operations */
export type NewSession = typeof sessions.$inferInsert;

/** User settings record type for SELECT operations */
export type UserSettings = typeof userSettings.$inferSelect;

/** User settings data type for INSERT operations */
export type NewUserSettings = typeof userSettings.$inferInsert;

/** WebAuthn challenge record types */
export type WebAuthnChallenge = typeof webauthnChallenges.$inferSelect;
export type NewWebAuthnChallenge = typeof webauthnChallenges.$inferInsert;

/**
 * User Addresses table schema
 *
 * Stores registered Starknet addresses for each user to enable transaction tracking.
 * This table maintains a one-to-many relationship with users, allowing multiple
 * addresses per user for different purposes (main wallet, trading, etc.).
 *
 * Fields:
 * - id: UUID primary key for address record
 * - userId: Foreign key reference to users table
 * - starknetAddress: The Starknet address to track (hex format)
 * - addressType: Type of address (main, trading, etc.)
 * - isActive: Whether this address is actively being monitored
 * - registeredAt: When the address was first registered
 * - lastScannedBlock: Last blockchain block number that was scanned for this address
 *
 * @example
 * ```typescript
 * const newAddress: NewUserAddress = {
 *   userId: 'user-uuid',
 *   starknetAddress: '0x1234...',
 *   addressType: 'main',
 *   isActive: true
 * };
 * ```
 */
export const userAddresses = pgTable('user_addresses', {
	/** UUID primary key with automatic generation */
	id: uuid('id').primaryKey().defaultRandom(),

	/** Foreign key reference to users table with cascade deletion */
	userId: uuid('user_id')
		.references(() => users.id, { onDelete: 'cascade' })
		.notNull(),

	/** Starknet address in hex format (0x prefixed, 64 chars) */
	starknetAddress: text('starknet_address').notNull(),

	/** Type of address for categorization */
	addressType: text('address_type').notNull().default('main'),

	/** Whether this address is actively being monitored */
	isActive: boolean('is_active').notNull().default(true),

	/** Address registration timestamp */
	registeredAt: timestamp('registered_at').defaultNow().notNull(),

	/** Last blockchain block number scanned for this address */
	lastScannedBlock: bigint('last_scanned_block', { mode: 'number' }).default(0)
});

/**
 * User Transactions table schema
 *
 * Stores minimal transaction data for registered user addresses.
 * Only essential information is stored to minimize storage while
 * providing transaction history and balance tracking capabilities.
 *
 * Fields:
 * - id: UUID primary key for transaction record
 * - userAddressId: Foreign key to user_addresses table
 * - transactionHash: Starknet transaction hash
 * - blockNumber: Block number where transaction was included
 * - transactionType: Whether this is a receipt or spent transaction
 * - amount: Transaction amount (as string to preserve precision)
 * - tokenAddress: Contract address of the token transferred
 * - fromAddress: Source address of the transaction
 * - toAddress: Destination address of the transaction
 * - timestamp: Blockchain timestamp of the transaction
 * - processedAt: When this transaction was processed by our system
 *
 * @example
 * ```typescript
 * const newTransaction: NewUserTransaction = {
 *   userAddressId: 'address-uuid',
 *   transactionHash: '0xabc123...',
 *   blockNumber: 123456n,
 *   transactionType: 'receipt',
 *   amount: '1000000000000000000',
 *   tokenAddress: '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7'
 * };
 * ```
 */
export const userTransactions = pgTable('user_transactions', {
	/** UUID primary key with automatic generation */
	id: uuid('id').primaryKey().defaultRandom(),

	/** Foreign key reference to user_addresses table with cascade deletion */
	userAddressId: uuid('user_address_id')
		.references(() => userAddresses.id, { onDelete: 'cascade' })
		.notNull(),

	/** Starknet transaction hash */
	transactionHash: text('transaction_hash').notNull(),

	/** Block number where transaction was included */
	blockNumber: bigint('block_number', { mode: 'number' }).notNull(),

	/** Transaction type: 'receipt' for incoming, 'spent' for outgoing */
	transactionType: text('transaction_type').notNull(),

	/** Transaction amount as string (preserves precision for large numbers) */
	amount: text('amount').notNull(),

	/** Contract address of the token transferred */
	tokenAddress: text('token_address').notNull(),

	/** Source address of the transaction */
	fromAddress: text('from_address').notNull(),

	/** Destination address of the transaction */
	toAddress: text('to_address').notNull(),

	/** Blockchain timestamp of the transaction */
	timestamp: timestamp('timestamp').notNull(),

	/** When this transaction was processed by our system */
	processedAt: timestamp('processed_at').defaultNow().notNull()
});

/** User address record type for SELECT operations */
export type UserAddress = typeof userAddresses.$inferSelect;

/** User address data type for INSERT operations */
export type NewUserAddress = typeof userAddresses.$inferInsert;

/** User transaction record type for SELECT operations */
export type UserTransaction = typeof userTransactions.$inferSelect;

/** User transaction data type for INSERT operations */
export type NewUserTransaction = typeof userTransactions.$inferInsert;
