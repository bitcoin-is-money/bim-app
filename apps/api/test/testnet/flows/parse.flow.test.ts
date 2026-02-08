import {UuidCodec} from '@bim/lib/encoding';
import {type CredentialCreationOptions, WebauthnVirtualAuthenticator} from '@bim/test-toolkit/auth';
import type {Hono} from 'hono';
import pg from 'pg';
import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';
import {TestDatabase, TestnetApp} from '../helpers';

// WBTC token address on Starknet Sepolia
const WBTC_TOKEN_ADDRESS = '0x00abbd7d98ad664568f204d6e1af6e02d6a5c55eb4e83c9fbbfc3ed8514efc09';

/**
 * API response type from /api/auth/register/begin
 */
interface BeginRegistrationResponse {
  options: {
    challenge: string;
    rpId: string;
    rpName: string;
    userId: string;
    userName: string;
    timeout: number;
  };
  challengeId: string;
  accountId: string;
}

/**
 * Prepared payment response from POST /api/payment/pay/parse
 */
interface PreparedPaymentResponse {
  network: string;
  amount: {value: number; currency: string};
  fee: {value: number; currency: string};
  description: string;
  invoice?: string;
  address?: string;
  tokenAddress?: string;
  expiresAt?: string;
}

const webAuthnOrigin = 'http://localhost:8080';

function toRegistrationOptions(apiResponse: BeginRegistrationResponse): CredentialCreationOptions {
  return {
    challenge: apiResponse.options.challenge,
    rp: {
      id: apiResponse.options.rpId,
      name: apiResponse.options.rpName,
    },
    user: {
      id: UuidCodec.toBase64Url(apiResponse.options.userId),
      name: apiResponse.options.userName,
      displayName: apiResponse.options.userName,
    },
    origin: webAuthnOrigin,
  };
}

/**
 * Parse Flow — Testnet
 *
 * Tests the payment parsing endpoint (POST /api/payment/pay/parse).
 * All parsing is offline (no network calls): BOLT11 decoding, BIP-21 parsing, ERC-681 parsing.
 *
 * NOTE: The /api/payment/* routes require authentication, so we register a user first.
 */
describe('Parse Flow (Testnet)', () => {
  let app: Hono;
  let pool: pg.Pool;
  let authenticator: WebauthnVirtualAuthenticator;
  let sessionCookie: string;

  beforeAll(async () => {
    pool = TestDatabase.createPool();
    authenticator = new WebauthnVirtualAuthenticator();
    app = TestnetApp.createTestApp();

    // Register a user to get a session cookie (payment routes require auth)
    sessionCookie = await registerAndGetSession('tn_parse_user');
  });

  beforeEach(async () => {
    // Don't reset DB between tests — we need the session to persist
  });

  afterAll(async () => {
    await pool.end();
  });

  /**
   * Registers a user and returns the session cookie.
   */
  async function registerAndGetSession(username: string): Promise<string> {
    const beginResponse = await TestnetApp
      .request(app)
      .post('/api/auth/register/begin', {username});
    const beginBody = await beginResponse.json() as BeginRegistrationResponse;
    const credential = await authenticator
      .createCredential(toRegistrationOptions(beginBody));
    const completeResponse = await TestnetApp
      .request(app)
      .post('/api/auth/register/complete', {
        challengeId: beginBody.challengeId,
        accountId: beginBody.accountId,
        username,
        credential,
      });
    expect(completeResponse.status).toBe(200);
    const setCookie = completeResponse.headers.get('Set-Cookie') || '';
    const sessionMatch = /session=([^;]+)/.exec(setCookie);
    return sessionMatch ? `session=${sessionMatch[1]}` : '';
  }

  describe('POST /api/payment/pay/parse', () => {

    it('parses a starknet: URI', async () => {
      const starknetUri = `starknet:0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7?amount=5000&token=${WBTC_TOKEN_ADDRESS}`;

      const response = await TestnetApp
        .request(app)
        .post('/api/payment/pay/parse', {data: starknetUri}, {
          headers: {Cookie: sessionCookie},
        });

      expect(response.status).toBe(200);
      const body = await response.json() as PreparedPaymentResponse;

      expect(body.network).toBe('starknet');
      expect(body.amount.value).toBe(5000);
      expect(body.amount.currency).toBe('SAT');
      expect(body.fee.value).toBeGreaterThan(0);
      expect(body.tokenAddress).toBe(WBTC_TOKEN_ADDRESS);
    });

    it('parses a bitcoin: URI', async () => {
      const bitcoinUri = 'bitcoin:bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4?amount=0.001&label=Test';

      const response = await TestnetApp
        .request(app)
        .post('/api/payment/pay/parse', {data: bitcoinUri}, {
          headers: {Cookie: sessionCookie},
        });

      expect(response.status).toBe(200);
      const body = await response.json() as PreparedPaymentResponse;

      expect(body.network).toBe('bitcoin');
      expect(body.amount.value).toBe(100000); // 0.001 BTC = 100,000 sats
      expect(body.description).toBe('Test');
    });

    it('rejects unknown payment format', async () => {
      const response = await TestnetApp
        .request(app)
        .post('/api/payment/pay/parse', {data: 'not-a-valid-payment-format'}, {
          headers: {Cookie: sessionCookie},
        });

      expect(response.status).toBe(400);
    });

    it('rejects empty data', async () => {
      const response = await TestnetApp
        .request(app)
        .post('/api/payment/pay/parse', {data: ''}, {
          headers: {Cookie: sessionCookie},
        });

      expect(response.status).toBe(400);
    });

    it('rejects unauthenticated request', async () => {
      const response = await TestnetApp
        .request(app)
        .post('/api/payment/pay/parse', {data: 'bitcoin:test?amount=0.001'});

      expect(response.status).toBe(401);
    });
  });
});
