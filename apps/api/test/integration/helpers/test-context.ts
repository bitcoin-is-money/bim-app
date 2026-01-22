import {drizzle, type NodePgDatabase} from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '../../../database/schema.js';

let pool: pg.Pool | undefined;
let db: NodePgDatabase<typeof schema> | undefined;

/**
 * Gets the test database client.
 * Creates a new connection pool if one doesn't exist.
 */
export function getTestDb(): NodePgDatabase<typeof schema> {
  if (!db) {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error('DATABASE_URL not set. Did global-setup run?');
    }

    pool = new pg.Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 30000,
    });

    db = drizzle(pool, {schema});
  }

  return db;
}

/**
 * Gets the raw pg Pool for direct SQL queries.
 */
export function getTestPool(): pg.Pool {
  if (!pool) {
    getTestDb();
  }
  return pool!;
}

/**
 * Truncates all tables in the correct order (respecting foreign keys).
 * Call this in beforeEach to reset the state between tests.
 */
export async function truncateAllTables(): Promise<void> {
  const database = getTestDb();

  // Delete tables in order respecting foreign key constraints
  await database.delete(schema.challenges);
  await database.delete(schema.sessions);
  await database.delete(schema.accounts);
}

/**
 * Closes the test database connection.
 * Call this in after all tests if needed.
 */
export async function closeTestDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
    db = undefined;
  }
}

/**
 * Test data factories
 */
export const testData = {
  /**
   * Creates a test account record
   */
  createAccountData(overrides?: Partial<schema.NewAccountRecord>): schema.NewAccountRecord {
    const id = crypto.randomUUID();
    return {
      id,
      username: `testUser_${id.slice(0, 8)}`,
      credentialId: `cred_${id}`,
      publicKey: `pubkey_${id}`,
      credentialPublicKey: null,
      starknetAddress: null,
      status: 'pending',
      deploymentTxHash: null,
      signCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  },

  /**
   * Creates a test session record
   */
  createSessionData(
    accountId: string,
    overrides?: Partial<schema.NewSessionRecord>,
  ): schema.NewSessionRecord {
    return {
      id: `session_${crypto.randomUUID()}`,
      accountId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      createdAt: new Date(),
      ...overrides,
    };
  },

  /**
   * Creates a test challenge record
   */
  createChallengeData(overrides?: Partial<schema.NewChallengeRecord>): schema.NewChallengeRecord {
    const id = crypto.randomUUID();
    return {
      id,
      challenge: `challenge_${id}`,
      purpose: 'registration',
      accountId: null,
      rpId: 'localhost',
      origin: 'http://localhost:8080',
      used: false,
      expiresAt: new Date(Date.now() + 60 * 1000), // 60 seconds
      createdAt: new Date(),
      ...overrides,
    };
  },
};

/**
 * Helper to insert test data
 */
export const testHelpers = {
  async insertAccount(data?: Partial<schema.NewAccountRecord>): Promise<schema.AccountRecord> {
    const database = getTestDb();
    const accountData = testData.createAccountData(data);
    const [inserted] = await database.insert(schema.accounts).values(accountData).returning();
    return inserted;
  },

  async insertSession(
    accountId: string,
    data?: Partial<schema.NewSessionRecord>,
  ): Promise<schema.SessionRecord> {
    const database = getTestDb();
    const sessionData = testData.createSessionData(accountId, data);
    const [inserted] = await database.insert(schema.sessions).values(sessionData).returning();
    return inserted;
  },

  async insertChallenge(data?: Partial<schema.NewChallengeRecord>): Promise<schema.ChallengeRecord> {
    const database = getTestDb();
    const challengeData = testData.createChallengeData(data);
    const [inserted] = await database.insert(schema.challenges).values(challengeData).returning();
    return inserted;
  },
};
