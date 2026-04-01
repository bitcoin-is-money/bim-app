import type {Hono} from 'hono';
import type pg from 'pg';
import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';

import type {BuildPaymentResponse} from '../../../src/routes';
import {AtomiqGatewayMock} from '../../unit/mocks/atomiq.gateway.mock';
import {StarknetGatewayMock} from '../../unit/mocks/starknet.gateway.mock';
import {type DbClient, TestApp, TestDatabase} from '../helpers';
import {AccountFixture} from '../helpers/account';
import {AuthFixture} from '../helpers/auth';

/**
 * Pay Lightning Fee — Integration Test
 *
 * Verifies that the fee returned in /build reflects the actual LP-quoted fee,
 * not just the estimated percentage from the limits catalogue.
 *
 * The Atomiq LP charges a percentage fee + a base/routing fee. Only the total
 * (amountSats) from the swap quote is accurate. The catalogue feePercent is
 * only an approximation.
 *
 * Uses the BOLT11 spec test vector: 250,000 sats, description "1 cup coffee".
 */

// BOLT11 test vector: 2500 µBTC (250,000 sats)
const INVOICE_250K_SATS =
  'lnbc2500u1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygspp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5xysxxatsyp3k7enxv4jsxqzpu9qrsgquk0rl77nj30yxdy8j9vdx85fkpmdla2087ne0xh8nhedh8w27kyke0lp53ut353s06fv3qfegext0eh0ymjpf39tuven09sam30g4vgpfna3rh';

const INVOICE_AMOUNT_SATS = 250_000;
const LP_QUOTED_TOTAL_SATS = 252_500n; // invoice + 2500 sats LP fee (1% effective)
const LP_FEE_SATS = 2_500; // 252500 - 250000
const BIM_FEE_SATS = 500; // 0.2% of 250000 (FeeConfig.DEFAULT_PERCENTAGES.lightning)
const EXPECTED_FEE_SATS = LP_FEE_SATS + BIM_FEE_SATS; // 2750 total

const STARKNET_ADDRESS = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('Pay Lightning — fee accuracy', () => {
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

    // Configure the mock to return a realistic LP-quoted amount
    // that includes the base/routing fee (not just the percentage)
    atomiqMock.setReverseSwapAmountSats(LP_QUOTED_TOTAL_SATS);

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

  function request() {
    return TestApp.request(app);
  }

  it('/build returns the real LP fee, not just the estimated percentage fee', async () => {
    const buildResponse = await request().post('/api/payment/pay/build', {
      paymentPayload: INVOICE_250K_SATS,
    }, {headers: {Cookie: sessionCookie}});

    expect(buildResponse.status).toBe(200);
    const body = await buildResponse.json() as BuildPaymentResponse;

    // The invoice amount should be 250,000 sats
    expect(body.payment.amount.value).toBe(INVOICE_AMOUNT_SATS);

    // The fee should reflect the real LP quote (2500 sats) + BIM fee (500 sats),
    // NOT the estimated catalogue percentage (0.5% of 250000 = 1250 sats)
    expect(body.payment.fee.value).toBe(EXPECTED_FEE_SATS);

    // The bimFee should be the BIM portion only (0.2% of 250000 = 500 sats)
    expect(body.payment.bimFee.value).toBe(BIM_FEE_SATS);
  });
});
