import {boolean, integer, pgTable, text, timestamp, uuid,} from 'drizzle-orm/pg-core';

// =============================================================================
// Accounts Table
// =============================================================================

export const accounts = pgTable('accounts', {
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

export const sessions = pgTable('sessions', {
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

export const challenges = pgTable('challenges', {
  id: uuid('id').primaryKey(),
  challenge: text('challenge').notNull(),
  purpose: text('purpose').notNull(),
  accountId: uuid('account_id').references(() => accounts.id, {
    onDelete: 'cascade',
  }),
  rpId: text('rp_id'),
  origin: text('origin'),
  used: boolean('used').notNull().default(false),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// =============================================================================
// Type Exports
// =============================================================================

export type AccountRecord = typeof accounts.$inferSelect;
export type NewAccountRecord = typeof accounts.$inferInsert;

export type SessionRecord = typeof sessions.$inferSelect;
export type NewSessionRecord = typeof sessions.$inferInsert;

export type ChallengeRecord = typeof challenges.$inferSelect;
export type NewChallengeRecord = typeof challenges.$inferInsert;
