import {describe, expect, it} from 'vitest';
import type {
  BitcoinPaymentResultResponse,
  BitcoinReceiveCommitResponse,
  BitcoinReceivePendingCommitResponse,
  BuildPaymentResponse,
  SwapStatusResponse,
} from '../../../src/routes';
import {createTestLogger} from '../../helpers';
import {
  assertTreasuryFeeCollected,
  buildTransferReport,
  fetchTreasuryStrkBalance,
  getAvnuCredits,
  pollAvnuCreditsAfter,
  sendSlackReport,
  setupTransferTest,
} from '../helpers';

/**
 * Scenario 04 — Bitcoin Transfer (E2E API prod)
 *
 * Transfers sats between two persistent BIM accounts via the Bitcoin Network.
 * This test is slow — Bitcoin on-chain confirmations can take 30+ minutes.
 */

const TRANSFER_AMOUNT_SATS = '12000';
const BIM_FEE_PERCENT = '0.3%';

describe('Scenario 04 — Bitcoin Transfer', () => {
  const rootLogger = createTestLogger();
  const log = rootLogger.child({name: '04-transfer-bitcoin.test.ts'});
  const ctx = setupTransferTest(rootLogger, BigInt(TRANSFER_AMOUNT_SATS), 'largest');
  ctx.title = '04 — Bitcoin Transfer';

  const rpId = (): string => process.env.WEBAUTHN_RP_ID ?? 'localhost';
  const origin = (): string => process.env.WEBAUTHN_ORIGIN ?? 'https://localhost';

  let bip21Uri: string;

  it('receiver creates Bitcoin receive request and signs commit', async () => {
    const {receiver} = ctx.pair;
    await receiver.ensureSessionAlive(log);

    const receiveBody = await receiver.post<BitcoinReceivePendingCommitResponse>(
      '/api/payment/receive',
      {network: 'bitcoin', amount: TRANSFER_AMOUNT_SATS},
      'POST /api/payment/receive',
    );

    expect(receiveBody.network).toBe('bitcoin');
    expect(receiveBody.status).toBe('pending_commit');
    log.info({swapId: receiveBody.swapId}, 'Bitcoin receive request created');

    const assertion = await receiver.signAssertion(
      receiveBody.messageHash,
      receiveBody.credentialId,
      rpId(),
      origin(),
    );

    const commitBody = await receiver.post<BitcoinReceiveCommitResponse>(
      '/api/payment/receive/commit',
      {buildId: receiveBody.buildId, assertion},
      'POST /api/payment/receive/commit',
    );

    expect(commitBody.network).toBe('bitcoin');
    bip21Uri = commitBody.bip21Uri;
    receiver.trackSwap(commitBody.swapId, 'bitcoin_to_starknet');
    log.info({depositAddress: commitBody.depositAddress, swapId: commitBody.swapId}, 'Bitcoin commit signed');
  });

  it('sender builds and executes Bitcoin payment', async () => {
    const {sender} = ctx.pair;
    await sender.ensureSessionAlive(log);

    const buildBody = await sender.post<BuildPaymentResponse>(
      '/api/payment/pay/build',
      {paymentPayload: bip21Uri},
      'POST /api/payment/pay/build',
    );

    expect(buildBody.buildId).toBeDefined();
    expect(buildBody.payment.network).toBe('bitcoin');

    ctx.totalFeeSats = buildBody.payment.fee.value;
    ctx.bimFeeSats = buildBody.payment.bimFee.value;

    const assertion = await sender.signAssertion(
      buildBody.messageHash,
      buildBody.credentialId,
      rpId(),
      origin(),
    );

    const execBody = await sender.post<BitcoinPaymentResultResponse>(
      '/api/payment/pay/execute',
      {buildId: buildBody.buildId, assertion},
      'POST /api/payment/pay/execute',
    );

    expect(execBody.network).toBe('bitcoin');
    expect(execBody.txHash).toMatch(/^0x/);

    sender.trackSwap(execBody.swapId, 'starknet_to_bitcoin');
    ctx.txHash = execBody.txHash;
    log.info({swapId: execBody.swapId, txHash: ctx.txHash}, 'Bitcoin payment executed');
  });

  it('sender swap (starknet_to_bitcoin) completes successfully', async () => {
    const {sender} = ctx.pair;
    const swapId = sender.getSwapId();
    if (swapId === undefined) throw new Error('Sender swap id not set');

    const timeoutSeconds = 45 * 60; // 45min
    const intervalMs = 10_000;
    const progressLogEveryMs = 2 * 60 * 1_000; // every 2 min
    const maxAttempts = Math.ceil((timeoutSeconds * 1_000) / intervalMs);
    let lastProgressLogAt = Date.now();

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const body = await sender.get<SwapStatusResponse>(
        `/api/swap/status/${swapId}`,
        `GET /api/swap/status/${swapId}`,
      );

      if (body.progress === 100) {
        expect(body.status).toBe('completed');
        log.info({elapsedSeconds: attempt * intervalMs / 1_000}, 'Sender swap completed (BTC sent to escrow)');
        return;
      }

      if (body.status === 'failed' || body.status === 'expired') {
        throw new Error(`Sender swap ${body.status} (swapId: ${swapId})`);
      }

      if (Date.now() - lastProgressLogAt >= progressLogEveryMs) {
        log.info({
          elapsedMinutes: Math.round(attempt * intervalMs / 60_000),
          status: body.status, progress: body.progress
        }, 'Still waiting for sender swap completion');
        lastProgressLogAt = Date.now();
      }

      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    throw new Error(`Sender swap did not complete after ${maxAttempts * intervalMs / 1_000}s`);
  });

  it('receiver swap (bitcoin_to_starknet) completes successfully', async () => {
    const {receiver} = ctx.pair;
    const swapId = receiver.getSwapId();
    if (swapId === undefined) throw new Error('Receiver swap id not set');

    const timeoutSeconds = 75 * 60; // 1h15
    const intervalMs = 10_000;
    const progressLogEveryMs = 2 * 60 * 1_000; // every 2 min
    const maxAttempts = Math.ceil((timeoutSeconds * 1_000) / intervalMs);

    // Refresh once before the loop: the receiver cookie has not been used during the
    // previous (long) step. Inside the loop, polling swap status every intervalMs keeps it active.
    await receiver.ensureSessionAlive(log);
    let lastProgressLogAt = Date.now();

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const body = await receiver.get<SwapStatusResponse>(
        `/api/swap/status/${swapId}`,
        `GET /api/swap/status/${swapId}`,
      );

      if (body.progress === 100) {
        ctx.endTime = Date.now();
        expect(body.status).toBe('completed');
        log.info({elapsedSeconds: attempt * intervalMs / 1_000}, 'Receiver swap completed (WBTC claimed)');
        return;
      }

      if (body.status === 'failed' || body.status === 'expired' || body.status === 'refunded') {
        throw new Error(`Receiver swap ${body.status} (swapId: ${swapId})`);
      }

      if (Date.now() - lastProgressLogAt >= progressLogEveryMs) {
        log.info({
          elapsedMinutes: Math.round(attempt * intervalMs / 60_000),
          status: body.status, progress: body.progress
        }, 'Still waiting for receiver swap completion');
        lastProgressLogAt = Date.now();
      }

      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    throw new Error(`Receiver swap did not complete after ${maxAttempts * intervalMs / 1_000}s`);
  });

  it('records balances after transfer', async () => {
    await ctx.pair.sender.ensureSessionAlive(log);
    await ctx.pair.receiver.ensureSessionAlive(log);
    await ctx.pair.sender.fetchBalance();
    await ctx.pair.receiver.fetchBalance();
  });

  it('treasury collected the BIM fee', async () => {
    const result = await assertTreasuryFeeCollected(log, ctx.treasuryWbtcBefore, BigInt(ctx.bimFeeSats));
    ctx.treasuryCollected = result.collected;
    ctx.treasuryCheckPassed = result.passed;
    ctx.treasuryWbtcAfter = result.after;
  });

  it('report', async () => { // NOSONAR
    // Refresh final BIM swap statuses so the report reflects the true end state
    // (the polling loops above may have returned right at progress=100, but
    // fetching once more is cheap and guarantees consistency with the fail path).
    await ctx.pair.sender.refreshSwapStatus();
    await ctx.pair.receiver.refreshSwapStatus();

    ctx.treasuryStrkAfter = await fetchTreasuryStrkBalance();
    ctx.avnuCreditsAfter = await pollAvnuCreditsAfter(getAvnuCredits, ctx.avnuCreditsBefore, log) ?? ctx.avnuCreditsBefore;

    const bimFeeExpectedSats = BigInt(ctx.bimFeeSats);
    const report = buildTransferReport({
      title: '04 — Bitcoin Transfer',
      status: 'PASS',
      transferAmountSats: TRANSFER_AMOUNT_SATS,
      bimFeePercent: BIM_FEE_PERCENT,
      bimFeeExpectedSats,
      bimFeeGotSats: ctx.treasuryCollected,
      bimFeeCheckPassed: ctx.treasuryCheckPassed,
      lpFeeSats: BigInt(ctx.totalFeeSats - ctx.bimFeeSats),
      totalFeeSats: BigInt(ctx.totalFeeSats),
      txHash: ctx.txHash,
      sender: ctx.pair.sender.toReportSummary(),
      receiver: ctx.pair.receiver.toReportSummary(),
      treasuryWbtcBefore: ctx.treasuryWbtcBefore,
      treasuryWbtcAfter: ctx.treasuryWbtcAfter,
      treasuryStrkBefore: ctx.treasuryStrkBefore,
      treasuryStrkAfter: ctx.treasuryStrkAfter,
      avnuCreditsBefore: ctx.avnuCreditsBefore,
      avnuCreditsAfter: ctx.avnuCreditsAfter,
      ...(ctx.prices !== undefined && {prices: ctx.prices}),
      durationSeconds: Math.round((ctx.endTime - ctx.startTime) / 1_000),
    });
    console.log('\n' + report);
    await sendSlackReport(log, report);
    ctx.reportSent = true;
  });
});
