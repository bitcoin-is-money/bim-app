import {boolean, integer, pgTable, text, timestamp, unique, uuid,} from 'drizzle-orm/pg-core';

// =============================================================================
// Accounts Table
// =============================================================================

export const accounts = pgTable('bim_accounts', {
  id: uuid('id').primaryKey(),
  username: text('username').notNull().unique(),
  credentialId: text('credential_id').notNull().unique(),
  publicKey: text('public_key').notNull(),
  credentialPublicKey: text('credential_public_key'),
  starknetAddress: text('starknet_address'),
  status: text('status').notNull().default('pending'),
  deploymentTxHash: text('deployment_tx_hash'),
  signCount: integer('sign_count').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// =============================================================================
// Sessions Table
// =============================================================================

export const sessions = pgTable('bim_sessions', {
  id: text('id').primaryKey(),
  accountId: uuid('account_id')
    .references(() => accounts.id, { onDelete: 'cascade' })
    .notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// =============================================================================
// WebAuthn Challenges Table
// =============================================================================

export const challenges = pgTable('bim_challenges', {
  id: uuid('id').primaryKey(),
  challenge: text('challenge').notNull(),
  purpose: text('purpose').notNull(),
  rpId: text('rp_id'),
  origin: text('origin'),
  used: boolean('used').notNull().default(false),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// =============================================================================
// User Settings Table
// =============================================================================

export const userSettings = pgTable('bim_user_settings', {
  id: uuid('id').primaryKey(),
  accountId: uuid('account_id')
    .references(() => accounts.id, {onDelete: 'cascade'})
    .notNull()
    .unique(),
  fiatCurrency: text('fiat_currency').notNull().default('USD'),
  language: text('language').notNull().default('en'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// =============================================================================
// Transactions Table
// =============================================================================

export const transactions = pgTable('bim_transactions', {
  id: uuid('id').primaryKey(),
  accountId: uuid('account_id')
    .references(() => accounts.id, {onDelete: 'cascade'})
    .notNull(),
  transactionHash: text('transaction_hash').notNull(),
  blockNumber: text('block_number').notNull(), // bigint as text for precision
  transactionType: text('transaction_type').notNull(), // 'receipt' | 'spent'
  amount: text('amount').notNull(),
  tokenAddress: text('token_address').notNull(),
  fromAddress: text('from_address').notNull(),
  toAddress: text('to_address').notNull(),
  timestamp: timestamp('timestamp').notNull(),
  indexedAt: timestamp('indexed_at').defaultNow().notNull(),
}, (table) => [
  unique('bim_transactions_hash_account_unique').on(table.transactionHash, table.accountId),
]);

// =============================================================================
// Type Exports
// =============================================================================

export type AccountRecord = typeof accounts.$inferSelect;
export type NewAccountRecord = typeof accounts.$inferInsert;

export type SessionRecord = typeof sessions.$inferSelect;
export type NewSessionRecord = typeof sessions.$inferInsert;

export type ChallengeRecord = typeof challenges.$inferSelect;
export type NewChallengeRecord = typeof challenges.$inferInsert;

export type UserSettingsRecord = typeof userSettings.$inferSelect;
export type NewUserSettingsRecord = typeof userSettings.$inferInsert;

export type TransactionRecord = typeof transactions.$inferSelect;
export type NewTransactionRecord = typeof transactions.$inferInsert;
