import {FeeConfig} from '@bim/domain/payment';
import {describe, expect, it} from 'vitest';
import type {
  BuildPaymentResponse,
  LightningPaymentResultResponse,
  LightningReceiveResponse,
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
 * Scenario 03 — Lightning Transfer (E2E API prod)
 *
 * Transfers sats between two persistent BIM accounts via the Lightning Network.
 */

const TRANSFER_AMOUNT_SATS = '1000';
const BIM_FEE_PERCENT = `${(FeeConfig.DEFAULT_PERCENTAGES.lightning * 100).toFixed(1)}%`;

describe('Scenario 03 — Lightning Transfer', () => {
  const rootLogger = createTestLogger();
  const log = rootLogger.child({name: '03-transfer-lightning.test.ts'});
  const ctx = setupTransferTest(rootLogger, BigInt(TRANSFER_AMOUNT_SATS), 'smallest');
  ctx.title = '03 — Lightning Transfer';

  const rpId = (): string => process.env.WEBAUTHN_RP_ID ?? 'localhost';
  const origin = (): string => process.env.WEBAUTHN_ORIGIN ?? 'https://localhost';

  let invoice: string;

  it('receiver creates a Lightning invoice', async () => {
    const {receiver} = ctx.pair;
    await receiver.ensureSessionAlive(log);

    const body = await receiver.post<LightningReceiveResponse>(
      '/api/payment/receive',
      {network: 'lightning', amount: TRANSFER_AMOUNT_SATS},
      'POST /api/payment/receive',
    );

    expect(body.network).toBe('lightning');
    expect(body.invoice).toBeDefined();
    expect(body.swapId).toBeDefined();

    invoice = body.invoice;
    receiver.trackSwap(body.swapId, 'lightning_to_starknet');
    log.info({swapId: body.swapId, invoice: invoice.slice(0, 40)}, 'Lightning invoice created');
  });

  it('sender builds and executes Lightning payment', async () => {
    const {sender} = ctx.pair;
    await sender.ensureSessionAlive(log);

    const buildBody = await sender.post<BuildPaymentResponse>(
      '/api/payment/pay/build',
      {paymentPayload: invoice},
      'POST /api/payment/pay/build',
    );

    expect(buildBody.buildId).toBeDefined();
    expect(buildBody.messageHash).toMatch(/^0x/);
    expect(buildBody.payment.network).toBe('lightning');

    ctx.totalFeeSats = buildBody.payment.fee.value;
    ctx.bimFeeSats = buildBody.payment.bimFee.value;

    const assertion = await sender.signAssertion(
      buildBody.messageHash,
      buildBody.credentialId,
      rpId(),
      origin(),
    );

    const execBody = await sender.post<LightningPaymentResultResponse>(
      '/api/payment/pay/execute',
      {buildId: buildBody.buildId, assertion},
      'POST /api/payment/pay/execute',
    );

    expect(execBody.network).toBe('lightning');
    expect(execBody.txHash).toMatch(/^0x/);

    sender.trackSwap(execBody.swapId, 'starknet_to_lightning');
    ctx.txHash = execBody.txHash;
    log.info({swapId: execBody.swapId, txHash: ctx.txHash}, 'Lightning payment executed');
  });

  it('swap completes successfully', async () => {
    const {sender} = ctx.pair;
    const swapId = sender.getSwapId();
    if (swapId === undefined) throw new Error('Sender swap id not set');

    const maxAttempts = 120;
    const intervalMs = 5_000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const body = await sender.get<SwapStatusResponse>(
        `/api/swap/status/${swapId}`,
        `GET /api/swap/status/${swapId}`,
      );

      if (body.progress === 100) {
        ctx.endTime = Date.now();
        expect(body.status).toBe('completed');
        log.info({elapsedSeconds: attempt * intervalMs / 1_000}, 'Swap completed');
        return;
      }

      if (body.status === 'failed' || body.status === 'expired') {
        throw new Error(`Swap ${body.status} (swapId: ${swapId})`);
      }

      // Log every ~2 minutes (24 * 5s = 120s)
      if (attempt % 24 === 0 && attempt > 0) {
        log.info({elapsedMinutes: Math.round(attempt * intervalMs / 60_000), status: body.status, progress: body.progress}, 'Still waiting for swap completion');
      }

      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    throw new Error(`Swap did not complete after ${maxAttempts * intervalMs / 1_000}s`);
  });

  it('records balances after transfer', async () => { // NOSONAR S2699 - scenario setup step; assertions happen in subsequent `it` blocks
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
    // (the polling loop above only waited for sender.progress === 100 and never
    // called refreshSwapStatus on either user).
    await ctx.pair.sender.refreshSwapStatus();
    await ctx.pair.receiver.refreshSwapStatus();

    ctx.treasuryStrkAfter = await fetchTreasuryStrkBalance();
    ctx.avnuCreditsAfter = await pollAvnuCreditsAfter(getAvnuCredits, ctx.avnuCreditsBefore, log) ?? ctx.avnuCreditsBefore;

    const bimFeeExpectedSats = BigInt(ctx.bimFeeSats);
    const report = buildTransferReport({
      title: '03 — Lightning Transfer',
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
