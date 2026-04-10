import type {WebauthnVirtualAuthenticator} from '@bim/test-toolkit/auth';
import type {Logger} from 'pino';
import type {GetBalanceResponse, SessionResponse, SwapStatusResponse} from '../../../src/routes';
import {loginUser} from './e2e-auth.js';
import type {E2eClient} from './e2e-client.js';
import {signMessageHash, type WebAuthnAssertion} from './e2e-signing.js';

export type AccountKey = 'accountA' | 'accountB';

export interface E2eUserInput {
  username: string;
  starknetAddress: string;
  authenticator: WebauthnVirtualAuthenticator;
  accountKey: AccountKey;
  sessionCookie: string;
  wbtcBalance: bigint;
  strkBalance: bigint;
}

/**
 * Snapshot of a user's state for inclusion in an e2e report.
 * Decouples the report builder from the E2eUser class internals.
 */
export interface UserReportSummary {
  readonly username: string;
  readonly initialWbtcBalance: bigint;
  readonly currentWbtcBalance: bigint;
  readonly initialStrkBalance: bigint;
  readonly currentStrkBalance: bigint;
  readonly swapDirection?: string;
  readonly bimStatus?: string;
}

type PersistAuthenticator = (accountKey: AccountKey, authenticator: WebauthnVirtualAuthenticator) => void;

/**
 * Represents an authenticated e2e test user. Wraps the HTTP client with
 * session-aware helpers, owns the user's balances (initial at login, current
 * after each refresh), and tracks the swap the user is currently involved in
 * for reporting purposes.
 */
export class E2eUser {
  readonly username: string;
  readonly starknetAddress: string;
  readonly authenticator: WebauthnVirtualAuthenticator;
  readonly accountKey: AccountKey;
  readonly initialWbtcBalance: bigint;
  readonly initialStrkBalance: bigint;

  private sessionCookie: string;
  private currentWbtcBalance: bigint;
  private currentStrkBalance: bigint;
  private swapId: string | undefined;
  private swapDirection: string | undefined;
  private bimSwapStatus: string | undefined;

  constructor(
    private readonly client: E2eClient,
    private readonly persistAuthenticator: PersistAuthenticator,
    input: E2eUserInput,
  ) {
    this.username = input.username;
    this.starknetAddress = input.starknetAddress;
    this.authenticator = input.authenticator;
    this.accountKey = input.accountKey;
    this.sessionCookie = input.sessionCookie;
    this.initialWbtcBalance = input.wbtcBalance;
    this.initialStrkBalance = input.strkBalance;
    this.currentWbtcBalance = input.wbtcBalance;
    this.currentStrkBalance = input.strkBalance;
  }

  // ===========================================================================
  // State accessors
  // ===========================================================================

  getCurrentWbtcBalance(): bigint {
    return this.currentWbtcBalance;
  }

  getCurrentStrkBalance(): bigint {
    return this.currentStrkBalance;
  }

  getSwapId(): string | undefined {
    return this.swapId;
  }

  getBimStatus(): string | undefined {
    return this.bimSwapStatus;
  }

  // ===========================================================================
  // HTTP helpers — cookie auto-injected, expectOk integrated
  // ===========================================================================

  async get<T>(path: string, context: string): Promise<T> {
    const response = await this.client.get(path, {headers: {Cookie: this.sessionCookie}});
    return this.client.expectOk<T>(response, context);
  }

  async post<T>(path: string, body: unknown, context: string): Promise<T> {
    const response = await this.client.post(path, body, {headers: {Cookie: this.sessionCookie}});
    return this.client.expectOk<T>(response, context);
  }

  // ===========================================================================
  // Session
  // ===========================================================================

  async ensureSessionAlive(log: Logger): Promise<void> {
    const response = await this.client.get('/api/auth/session', {headers: {Cookie: this.sessionCookie}});
    if (response.status === 200) {
      const body = await response.json() as SessionResponse;
      if (body.authenticated) return;
    }

    log.info({username: this.username}, 'Session expired — re-logging in');
    const {sessionCookie} = await loginUser(this.client, this.authenticator);
    this.sessionCookie = sessionCookie;
    this.persistAuthenticator(this.accountKey, this.authenticator);
    log.info({username: this.username}, 'Re-login successful');
  }

  // ===========================================================================
  // Balance
  // ===========================================================================

  async fetchBalance(): Promise<void> {
    const body = await this.get<GetBalanceResponse>('/api/account/balance', `balance (${this.username})`);
    this.currentWbtcBalance = BigInt(body.wbtcBalance.amount);
    this.currentStrkBalance = BigInt(body.strkBalance.amount);
  }

  // ===========================================================================
  // WebAuthn signing
  // ===========================================================================

  async signAssertion(
    messageHash: string,
    credentialId: string,
    rpId: string,
    origin: string,
  ): Promise<WebAuthnAssertion> {
    return signMessageHash(this.authenticator, messageHash, credentialId, rpId, origin);
  }

  // ===========================================================================
  // Swap tracking — for the report
  // ===========================================================================

  trackSwap(swapId: string, direction: string): void {
    this.swapId = swapId;
    this.swapDirection = direction;
  }

  /**
   * Fetches the latest BIM status for the currently tracked swap (if any).
   * No-op when no swap has been tracked. Errors are propagated — callers
   * running this in a fail path should wrap with try/catch.
   */
  async refreshSwapStatus(): Promise<void> {
    if (this.swapId === undefined) return;
    const body = await this.get<SwapStatusResponse>(
      `/api/swap/status/${this.swapId}`,
      `swap status (${this.username})`,
    );
    this.bimSwapStatus = body.status;
  }

  // ===========================================================================
  // Report summary
  // ===========================================================================

  toReportSummary(): UserReportSummary {
    return {
      username: this.username,
      initialWbtcBalance: this.initialWbtcBalance,
      currentWbtcBalance: this.currentWbtcBalance,
      initialStrkBalance: this.initialStrkBalance,
      currentStrkBalance: this.currentStrkBalance,
      ...(this.swapDirection !== undefined && {swapDirection: this.swapDirection}),
      ...(this.bimSwapStatus !== undefined && {bimStatus: this.bimSwapStatus}),
    };
  }
}
