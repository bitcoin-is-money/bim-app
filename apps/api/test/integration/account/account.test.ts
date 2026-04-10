import {accounts} from '@bim/db';
import type pg from "pg";
import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';
import {type DbClient, TestApp, TestDatabase} from '../helpers';
import {AccountFixture} from "../helpers/account";
import {AuthFixture} from "../helpers/auth";

describe('Account API', () => {
  let pool: pg.Pool;
  let db: DbClient;
  let accountFixture: AccountFixture;
  let authFixture: AuthFixture;

  beforeAll(async () => {
    await TestApp.createTestApp();
    pool = TestDatabase.createPool();
    db = TestDatabase.getClient(pool);
    accountFixture = AccountFixture.create(db);
    authFixture = AuthFixture.create(db);
  });

  beforeEach(async () => {
    await TestDatabase.reset(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('Database operations', () => {
    it('creates and retrieves accounts from database', async () => {
      const account = await accountFixture.insertAccount({
        username: 'testUser',
        status: 'deployed',
        starknetAddress: '0x123456789abcdef',
      });

      expect(account.id).toBeDefined();
      expect(account.username).toBe('testUser');
      expect(account.status).toBe('deployed');
      expect(account.starknetAddress).toBe('0x123456789abcdef');
    });

    it('isolates data between tests (truncate works)', async () => {
      // The account created in the previous test should not exist
      const allAccounts = await db.select().from(accounts);

      // Table should be empty because beforeEach truncates
      expect(allAccounts).toHaveLength(0);
    });

    it('handles session creation with account', async () => {
      const account = await accountFixture.insertAccount();
      const session = await authFixture.insertSession(account.id);

      expect(session.accountId).toBe(account.id);
      expect(session.expiresAt).toBeDefined();
    });

    it('handles challenge creation', async () => {
      const challenge = await authFixture.insertChallenge({
        purpose: 'authentication',
      });

      expect(challenge.id).toBeDefined();
      expect(challenge.purpose).toBe('authentication');
      expect(challenge.used).toBe(false);
    });
  });
});
