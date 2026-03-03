import * as schema from '@bim/db';
import type {Hono} from 'hono';
import type pg from 'pg';
import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';

import type {BuildPaymentResponse, PreparedPaymentResponse} from '../../../src/routes';
import {AtomiqGatewayMock} from '../../unit/mocks/atomiq.gateway.mock';
import {StarknetGatewayMock} from '../../unit/mocks/starknet.gateway.mock';
import {type DbClient, TestApp, TestDatabase} from '../helpers';
import {AccountFixture} from '../helpers/account';
import {AuthFixture} from '../helpers/auth';

/**
 * Pay Lightning Description — Integration Test
 *
 * Verifies that the BOLT11 invoice memo is used as the swap description
 * when the frontend does not explicitly send a description in /build.
 *
 * Uses the BOLT11 spec test vector: 250,000 sats, memo "1 cup coffee".
 */

// BOLT11 test vector: 2500 µBTC (250,000 sats), description "1 cup coffee"
const INVOICE_WITH_DESCRIPTION =
  'lnbc2500u1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygspp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5xysxxatsyp3k7enxv4jsxqzpu9qrsgquk0rl77nj30yxdy8j9vdx85fkpmdla2087ne0xh8nhedh8w27kyke0lp53ut353s06fv3qfegext0eh0ymjpf39tuven09sam30g4vgpfna3rh';

const STARKNET_ADDRESS = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('Pay Lightning — invoice description propagation', () => {
  let app: Hono;
  let pool: pg.Pool;
  let db: DbClient;
  let atomiqMock: AtomiqGatewayMock;
  let accountFixture: AccountFixture;
  let authFixture: AuthFixture;

  let sessionCookie: string;

  beforeAll(async () => {
    atomiqMock = new AtomiqGatewayMock();
    const starknetMock = new StarknetGatewayMock();
    pool = TestDatabase.createPool();
    db = TestDatabase.getClient(pool);
    accountFixture = AccountFixture.create(db);
    authFixture = AuthFixture.create(db);

    app = await TestApp.createTestApp({
      context: {
        gateways: {atomiq: atomiqMock, starknet: starknetMock},
      },
    });
  });

  beforeEach(async () => {
    await TestDatabase.reset(pool);
    atomiqMock.clearSwaps();
    // BOLT11 test invoice is 250,000 sats; LP total must be >= invoice amount
    atomiqMock.setReverseSwapAmountSats(251250n);

    const account = await accountFixture.insertAccount({
      status: 'deployed',
      starknetAddress: STARKNET_ADDRESS,
    });
    const session = await authFixture.insertSession(account.id);
    sessionCookie = `session=${session.id}`;
  });

  afterAll(async () => {
    await pool.end();
  });

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function request() {
    return TestApp.request(app);
  }

  // ---------------------------------------------------------------------------
  // Tests
  // ---------------------------------------------------------------------------

  it('/parse returns the BOLT11 invoice description', async () => {
    const response = await request().post('/api/payment/pay/parse', {
      paymentPayload: INVOICE_WITH_DESCRIPTION,
    }, {headers: {Cookie: sessionCookie}});

    expect(response.status).toBe(200);
    const body = await response.json() as PreparedPaymentResponse;

    expect(body.network).toBe('lightning');
    expect(body.description).toBe('1 cup coffee');
  });

  it('/build stores the invoice description on the swap when no description is provided', async () => {
    // Call /build WITHOUT providing a description in the body
    const buildResponse = await request().post('/api/payment/pay/build', {
      paymentPayload: INVOICE_WITH_DESCRIPTION,
      // description intentionally omitted
    }, {headers: {Cookie: sessionCookie}});

    expect(buildResponse.status).toBe(200);
    const buildBody = await buildResponse.json() as BuildPaymentResponse;
    expect(buildBody.buildId).toBeDefined();

    // Query the swap directly in the database
    const swapRows = await db.select().from(schema.swaps);
    expect(swapRows).toHaveLength(1);

    // The swap description should be the invoice memo, not "Sent"
    expect(swapRows[0]!.description).toBe('1 cup coffee');
  });
});
