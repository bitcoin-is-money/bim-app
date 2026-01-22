import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';
import {createTestApp} from '../helpers/test-app';
import {closeTestDb, testHelpers, truncateAllTables} from '../helpers/test-context';
import type {Hono} from 'hono';

describe('Account API', () => {
  let app: Hono;

  beforeAll(() => {
    app = createTestApp();
  });

  beforeEach(async () => {
    await truncateAllTables();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  describe('Database operations', () => {
    it('should be able to create and retrieve accounts from database', async () => {
      // Insert the test account directly
      const account = await testHelpers.insertAccount({
        username: 'testUser',
        status: 'deployed',
        starknetAddress: '0x123456789abcdef',
      });

      expect(account.id).toBeDefined();
      expect(account.username).toBe('testUser');
      expect(account.status).toBe('deployed');
      expect(account.starknetAddress).toBe('0x123456789abcdef');
    });

    it('should isolate data between tests (truncate works)', async () => {
      // This test runs after the previous one
      // The account created in the previous test should not exist
      const {getTestDb} = await import('../helpers/test-context.js');
      const {accounts} = await import('../../../database/schema.js');

      const db = getTestDb();
      const allAccounts = await db.select().from(accounts);

      // Table should be empty because beforeEach truncates
      expect(allAccounts).toHaveLength(0);
    });

    it('should handle session creation with account', async () => {
      const account = await testHelpers.insertAccount();
      const session = await testHelpers.insertSession(account.id);

      expect(session.accountId).toBe(account.id);
      expect(session.expiresAt).toBeDefined();
    });

    it('should handle challenge creation', async () => {
      const challenge = await testHelpers.insertChallenge({
        purpose: 'authentication',
      });

      expect(challenge.id).toBeDefined();
      expect(challenge.purpose).toBe('authentication');
      expect(challenge.used).toBe(false);
    });
  });
});
