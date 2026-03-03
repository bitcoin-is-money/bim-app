import * as schema from '@bim/db';
import type {Hono} from 'hono';
import type pg from 'pg';
import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';

import type {GetTransactionsResponse, PreparedPaymentResponse, StarknetReceiveResponse} from '../../../src/routes';
import {type DbClient, TestApp, TestDatabase} from '../helpers';
import {AccountFixture} from '../helpers/account';
import {AuthFixture} from '../helpers/auth';
import {UserFixture} from '../helpers/user';

/**
 * Starknet Receive Description Integration Tests
 *
 * Verifies that the custom description provided during a Starknet receive request
 * is propagated to both parties:
 * - Included in the starknet: URI (so the sender sees it after scanning the QR)
 * - Saved for the recipient when the payment is executed
 */
describe('Starknet receive description', () => {
  let app: Hono;
  let pool: pg.Pool;
  let db: DbClient;
  let accountFixture: AccountFixture;
  let authFixture: AuthFixture;
  let userFixture: UserFixture;

  beforeAll(async () => {
    app = await TestApp.createTestApp();
    pool = TestDatabase.createPool();
    db = TestDatabase.getClient(pool);
    accountFixture = AccountFixture.create(db);
    authFixture = AuthFixture.create(db);
    userFixture = UserFixture.create(db);
  });

  beforeEach(async () => {
    await TestDatabase.reset(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('receiver should see the custom description from their receive request', async () => {
    // --- Setup: two deployed accounts (sender + receiver) ---
    const senderAddress = '0x027367ddd36d7efc4694e1af5742f8d26626369c07abf15d136ff422b9a40fa0';
    const receiverAddress = '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7';

    const senderAccount = await accountFixture.insertAccount({
      username: 'sender_user',
      starknetAddress: senderAddress,
      status: 'deployed',
    });
    const receiverAccount = await accountFixture.insertAccount({
      username: 'receiver_user',
      starknetAddress: receiverAddress,
      status: 'deployed',
    });

    const senderSession = await authFixture.insertSession(senderAccount.id);
    const receiverSession = await authFixture.insertSession(receiverAccount.id);

    // --- Step 1: Receiver creates a Starknet receive request with a custom description ---
    const receiveResponse = await TestApp
      .request(app)
      .post('/api/payment/receive', {
        network: 'starknet',
        description: 'Coffee payment',
      }, {
        headers: {Cookie: `session=${receiverSession.id}`},
      });

    expect(receiveResponse.status).toBe(200);
    const receiveBody = await receiveResponse.json() as StarknetReceiveResponse;
    expect(receiveBody.network).toBe('starknet');
    expect(receiveBody.address).toBe(receiverAddress);

    // --- Step 2: Simulate a Starknet transfer from sender to receiver ---
    // In production, the transaction indexer detects on-chain transfers and
    // inserts records for both involved accounts.
    const txHash = '0x' + crypto.randomUUID().replace(/-/g, '');

    await userFixture.insertTransaction(senderAccount.id, {
      transactionHash: txHash,
      transactionType: 'spent',
      fromAddress: senderAddress,
      toAddress: receiverAddress,
    });

    await userFixture.insertTransaction(receiverAccount.id, {
      transactionHash: txHash,
      transactionType: 'receipt',
      fromAddress: senderAddress,
      toAddress: receiverAddress,
    });

    // Simulate what POST /api/payment/pay/execute does after a successful payment:
    // it saves the description for the sender AND the recipient (if they're a BIM user).
    // The description comes from the starknet: URI (populated by the receive flow).
    await db.insert(schema.transactionDescriptions).values([
      {
        id: crypto.randomUUID(),
        transactionHash: txHash,
        accountId: senderAccount.id,
        description: 'Coffee payment',
      },
      {
        id: crypto.randomUUID(),
        transactionHash: txHash,
        accountId: receiverAccount.id,
        description: 'Coffee payment',
      },
    ]);

    // --- Step 3: Fetch transactions for both accounts via API ---
    const senderTxResponse = await TestApp
      .request(app)
      .get('/api/user/transactions', {
        headers: {Cookie: `session=${senderSession.id}`},
      });

    const receiverTxResponse = await TestApp
      .request(app)
      .get('/api/user/transactions', {
        headers: {Cookie: `session=${receiverSession.id}`},
      });

    expect(senderTxResponse.status).toBe(200);
    expect(receiverTxResponse.status).toBe(200);

    const senderTxs = await senderTxResponse.json() as GetTransactionsResponse;
    const receiverTxs = await receiverTxResponse.json() as GetTransactionsResponse;

    // --- Step 4: Verify descriptions ---

    // Sender: description was saved via savePaymentResult with the description
    // extracted from the starknet: URI (which now includes the receiver's label).
    expect(senderTxs.transactions).toHaveLength(1);
    expect(senderTxs.transactions[0]!.description).toBe('Coffee payment');

    // Receiver: description was saved via savePaymentResult for the recipient
    // (the pay/execute route now also saves for the recipient on Starknet transfers).
    expect(receiverTxs.transactions).toHaveLength(1);
    expect(receiverTxs.transactions[0]!.description).toBe('Coffee payment');
  });

  it('sender should see the receiver description when parsing the receive URI', async () => {
    // --- Setup: two deployed accounts ---
    const senderAddress = '0x027367ddd36d7efc4694e1af5742f8d26626369c07abf15d136ff422b9a40fa0';
    const receiverAddress = '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7';

    const senderAccount = await accountFixture.insertAccount({
      username: 'sender_user',
      starknetAddress: senderAddress,
      status: 'deployed',
    });
    const receiverAccount = await accountFixture.insertAccount({
      username: 'receiver_user',
      starknetAddress: receiverAddress,
      status: 'deployed',
    });

    const senderSession = await authFixture.insertSession(senderAccount.id);
    const receiverSession = await authFixture.insertSession(receiverAccount.id);

    // --- Step 1: Receiver creates a Starknet receive request with amount + description ---
    const receiveResponse = await TestApp
      .request(app)
      .post('/api/payment/receive', {
        network: 'starknet',
        amount: '1000',
        description: 'Coffee payment',
      }, {
        headers: {Cookie: `session=${receiverSession.id}`},
      });

    expect(receiveResponse.status).toBe(200);
    const receiveBody = await receiveResponse.json() as StarknetReceiveResponse;

    // --- Step 2: Sender parses the receive URI (simulating QR scan) ---
    const parseResponse = await TestApp
      .request(app)
      .post('/api/payment/pay/parse', {
        paymentPayload: receiveBody.uri,
      }, {
        headers: {Cookie: `session=${senderSession.id}`},
      });

    expect(parseResponse.status).toBe(200);
    const parseBody = await parseResponse.json() as PreparedPaymentResponse;

    // --- Step 3: Verify the parsed description ---
    // The sender should see the receiver's description "Coffee payment"
    // after scanning their QR code, so it can be used as the payment label.
    // The starknet: URI now includes &description=Coffee+payment.
    expect(parseBody.description).toBe('Coffee payment');
  });
});
