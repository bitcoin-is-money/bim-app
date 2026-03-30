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
 * Pay Bitcoin Fee — Integration Test
 *
 * Verifies that the fee returned in /build reflects the actual LP-quoted fee,
 * not just the estimated percentage from the limits catalogue.
 *
 * Mirror of pay-lightning-fee.test.ts but for the Bitcoin network path.
 *
 * Uses a BIP-21 URI with a mainnet address and 100,000 sats (0.001 BTC).
 */

// BIP-21 URI: tb1 testnet address, 0.001 BTC = 100,000 sats
const BTC_BIP21_URI = 'bitcoin:tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx?amount=0.001';

const REQUESTED_AMOUNT_SATS = 100_000;
const LP_QUOTED_TOTAL_SATS = 101_000n; // requested + 1000 sats LP fee (1% effective)
const LP_FEE_SATS = 1_000; // 101000 - 100000
const BIM_FEE_SATS = 300; // 0.3% of 100000 (FeeConfig.DEFAULT_PERCENTAGES.bitcoin)
const EXPECTED_FEE_SATS = LP_FEE_SATS + BIM_FEE_SATS; // 1300 total

const STARKNET_ADDRESS = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('Pay Bitcoin — fee accuracy', () => {
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
      paymentPayload: BTC_BIP21_URI,
    }, {headers: {Cookie: sessionCookie}});

    expect(buildResponse.status).toBe(200);
    const body = await buildResponse.json() as BuildPaymentResponse;

    // The requested amount should be 100,000 sats
    expect(body.payment.amount.value).toBe(REQUESTED_AMOUNT_SATS);

    // The fee should reflect the real LP quote (1000 sats) + BIM fee (300 sats),
    // NOT the estimated catalogue percentage (0.3% of 100000 = 300 sats)
    expect(body.payment.fee.value).toBe(EXPECTED_FEE_SATS);
  });
});
