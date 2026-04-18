import {serializeError} from '@bim/lib/error';
import type {Logger} from 'pino';
import {afterAll, afterEach, beforeAll, expect, it} from 'vitest';
import {type E2eSecretFile, loadAndLoginAccounts, type SenderStrategy, type TransferPair} from './e2e-accounts.js';
import {E2eClient} from './e2e-client.js';
import {buildFailReport, sendSlackReport} from './e2e-report.js';
import {fetchPrices, getAvnuCredits, getTokenBalance, type Prices} from './e2e-rpc.js';
import {areAccountsReady, isServerHealthy} from './prechecks.js';

// STRK token address on Starknet mainnet (same as apps/api/src/app-config.ts)
export const STRK_TOKEN_ADDRESS = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';

/**
 * Shared state for transfer test scenarios (02, 03, 04).
 * Populated during `beforeAll`, available in `it()` blocks.
 *
 * Balance state is held on `pair.sender` / `pair.receiver` (initial at login,
 * current after each `fetchBalance()`), not here.
 */
export interface TransferTestContext {
  client: E2eClient;
  secrets: E2eSecretFile;
  pair: TransferPair;
  treasuryWbtcBefore: bigint;
  treasuryWbtcAfter: bigint;
  treasuryStrkBefore: bigint;
  treasuryStrkAfter: bigint;
  avnuCreditsBefore: bigint;
  avnuCreditsAfter: bigint;
  prices?: Prices;
  startTime: number;
  endTime: number;

  // Filled by individual tests for the report
  bimFeePercent: string;
  transferAmountSats: string;
  txHash: string;
  totalFeeSats: number;
  bimFeeSats: number;
  treasuryCollected: bigint;
  treasuryCheckPassed: boolean;
  title: string;
  reportSent: boolean;
}

/**
 * Fetches the BIM treasury STRK balance via Starknet RPC.
 * Used by scenario report steps to snapshot the after-state.
 */
export async function fetchTreasuryStrkBalance(): Promise<bigint> {
  const rpcUrl = process.env.STARKNET_RPC_URL;
  const treasuryAddress = process.env.BIM_TREASURY_ADDRESS;
  if (!rpcUrl || !treasuryAddress) {
    throw new Error('STARKNET_RPC_URL and BIM_TREASURY_ADDRESS must be set');
  }
  return getTokenBalance(rpcUrl, STRK_TOKEN_ADDRESS, treasuryAddress);
}

/**
 * Sets up beforeAll/afterAll hooks and prechecks for transfer tests.
 *
 * - beforeAll: creates client, logs in both accounts (populates initial balances),
 *   determines sender/receiver, snapshots the treasury WBTC balance
 * - afterAll: on failure, best-effort refresh of swap statuses and sends a
 *   fail report including them
 * - Registers precheck tests for health and balance
 *
 * Returns a context object populated asynchronously in `beforeAll`.
 */
export function setupTransferTest(
  rootLogger: Logger,
  minBalanceSats: bigint,
  senderStrategy: SenderStrategy = 'largest',
): TransferTestContext {
  // Fields are undefined until beforeAll runs.
  // Vitest guarantees beforeAll completes before any it() block.
  const ctx = {} as TransferTestContext;
  const log = rootLogger.child({name: 'e2e-transfer-setup.ts'});
  let lastError: unknown;

  afterEach((testCtx) => {
    if (testCtx.task.result?.state === 'fail' && lastError === undefined) {
      lastError = testCtx.task.result.errors?.[0];
    }
  });

  beforeAll(async () => {
    // Capture any throw from the setup itself — afterEach only fires for it()
    // blocks, so without this wrapper errors thrown here (e.g. insufficient
    // balance, AVNU credits too low) would reach afterAll with lastError still
    // undefined and the fail report would say "(no error captured ...)".
    try {
      ctx.startTime = Date.now();
      ctx.endTime = 0;
      ctx.client = new E2eClient();
      const loaded = await loadAndLoginAccounts(ctx.client, log, minBalanceSats, senderStrategy);
      ctx.secrets = loaded.secrets;
      ctx.pair = loaded.pair;

      // Fetch BTC/STRK prices from CoinGecko (best-effort — USD columns show n/a on failure)
      const prices = await fetchPrices();
      if (prices) {
        ctx.prices = prices;
        log.info({btcUsd: prices.btcUsd, strkUsd: prices.strkUsd}, 'CoinGecko prices fetched');
      } else {
        log.warn('Failed to fetch prices from CoinGecko — USD columns will show n/a');
      }

      // Check AVNU paymaster credits (minimum 10 STRK)
      const avnuCredits = await getAvnuCredits();
      if (avnuCredits === undefined) {
        log.warn('Could not fetch AVNU credits — check API key in .secrets.json');
      } else {
        ctx.avnuCreditsBefore = avnuCredits;
        const creditsStrk = Number(avnuCredits) / 1e18;
        if (creditsStrk < 10) {
          throw new Error(
            `AVNU paymaster credits too low: ${creditsStrk.toFixed(2)} STRK (minimum 10 STRK).\n` +
            'Top up with: ./bim avnu:refund',
          );
        }
        log.info(`AVNU credits: ${creditsStrk.toFixed(2)} STRK`);
      }

      // Snapshot BIM treasury balances (WBTC + STRK) before any transfer
      const rpcUrl = process.env.STARKNET_RPC_URL;
      const wbtcAddress = process.env.WBTC_TOKEN_ADDRESS;
      const treasuryAddress = process.env.BIM_TREASURY_ADDRESS;
      if (rpcUrl && wbtcAddress && treasuryAddress) {
        ctx.treasuryWbtcBefore = await getTokenBalance(rpcUrl, wbtcAddress, treasuryAddress);
        ctx.treasuryStrkBefore = await getTokenBalance(rpcUrl, STRK_TOKEN_ADDRESS, treasuryAddress);
        log.info(`Treasury WBTC balance before: ${ctx.treasuryWbtcBefore.toString()}`);
        log.info(`Treasury STRK balance before: ${ctx.treasuryStrkBefore.toString()}`);
      }
    } catch (err) {
      if (lastError === undefined) lastError = err;
      throw err;
    }
  });

  afterAll(async () => {
    if (ctx.reportSent) return;

    // Best-effort refresh of swap statuses so the fail report shows where each
    // side got stuck. Each call is guarded — a failing refresh must never mask
    // the real error.
    if (ctx.pair?.sender?.getSwapId() !== undefined) {
      try {
        await ctx.pair.sender.refreshSwapStatus();
      } catch (err) {
        log.warn({cause: serializeError(err)}, 'Sender swap status refresh failed');
      }
    }
    if (ctx.pair?.receiver?.getSwapId() !== undefined) {
      try {
        await ctx.pair.receiver.refreshSwapStatus();
      } catch (err) {
        log.warn({cause: serializeError(err)}, 'Receiver swap status refresh failed');
      }
    }

    const report = buildFailReport({
      title: ctx.title ?? 'Unknown scenario',
      durationSeconds: Math.round((Date.now() - (ctx.startTime ?? Date.now())) / 1_000),
      error: lastError,
      ...(ctx.pair?.sender !== undefined && {sender: ctx.pair.sender.toReportSummary()}),
      ...(ctx.pair?.receiver !== undefined && {receiver: ctx.pair.receiver.toReportSummary()}),
    });
    log.error('\n' + report);
    await sendSlackReport(log, report);
  });

  it('pre-check: server is healthy', async () => {
    expect(await isServerHealthy(ctx.client)).toBe(true);
  });

  it('pre-check: both accounts deployed with sufficient balance', async () => {
    expect(await areAccountsReady(ctx.client, ctx.pair, minBalanceSats)).toBe(true);
  });

  return ctx;
}

/**
 * Verifies the treasury WBTC balance increased by at least `expectedMinFee` sats.
 * Call this in a final `it()` block after the transfer completes.
 */
export async function assertTreasuryFeeCollected(
  log: Logger,
  treasuryWbtcBefore: bigint,
  expectedMinFee: bigint,
): Promise<{collected: bigint; passed: boolean; after: bigint}> {
  const rpcUrl = process.env.STARKNET_RPC_URL;
  const wbtcAddress = process.env.WBTC_TOKEN_ADDRESS;
  const treasuryAddress = process.env.BIM_TREASURY_ADDRESS;
  if (!rpcUrl || !wbtcAddress || !treasuryAddress) {
    throw new Error('STARKNET_RPC_URL, WBTC_TOKEN_ADDRESS, and BIM_TREASURY_ADDRESS must be set');
  }

  log.info({
    rpcUrl,
    wbtcAddress,
    treasuryAddress,
    treasuryWbtcBefore: treasuryWbtcBefore.toString(),
    expectedMinFee: expectedMinFee.toString(),
  }, 'Treasury fee check — env vars');

  // Wait for the transaction to be confirmed and balance to update
  const maxAttempts = 12;
  const intervalMs = 5_000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const treasuryWbtcAfter = await getTokenBalance(rpcUrl, wbtcAddress, treasuryAddress);
    const collected = treasuryWbtcAfter - treasuryWbtcBefore;

    log.info({
      treasuryWbtcBefore: treasuryWbtcBefore.toString(),
      treasuryWbtcAfter: treasuryWbtcAfter.toString(),
      collected: collected.toString(),
      expectedMinFee: expectedMinFee.toString(),
      attempt,
    }, 'Treasury fee verification');

    if (collected >= expectedMinFee) {
      return {collected, passed: true, after: treasuryWbtcAfter};
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  // Final check with assertion
  const finalBalance = await getTokenBalance(rpcUrl, wbtcAddress, treasuryAddress);
  const finalCollected = finalBalance - treasuryWbtcBefore;
  expect(finalCollected).toBeGreaterThanOrEqual(expectedMinFee);
  return {collected: finalCollected, passed: true, after: finalBalance};
}
