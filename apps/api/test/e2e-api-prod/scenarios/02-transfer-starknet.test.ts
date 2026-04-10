import {describe, expect, it} from 'vitest';
import type {BuildPaymentResponse, StarknetPaymentResultResponse,} from '../../../src/routes';
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
 * Scenario 02 — Starknet Transfer (E2E API prod)
 *
 * Transfers WBTC directly on Starknet between two persistent BIM accounts.
 * No swap involved — pure on-chain ERC-20 transfer via AVNU paymaster.
 */

const TRANSFER_AMOUNT_SATS = '1000';
const BIM_FEE_PERCENT = '0.1%';

describe('Scenario 02 — Starknet Transfer', () => {
  const rootLogger = createTestLogger();
  const log = rootLogger.child({name: '02-transfer-starknet.test.ts'});
  const ctx = setupTransferTest(rootLogger, BigInt(TRANSFER_AMOUNT_SATS), 'smallest');
  ctx.title = '02 — Starknet Transfer';

  const rpId = (): string => process.env.WEBAUTHN_RP_ID ?? 'localhost';
  const origin = (): string => process.env.WEBAUTHN_ORIGIN ?? 'https://localhost';

  it('sender builds and executes Starknet WBTC transfer', async () => {
    const wbtcTokenAddress = process.env.WBTC_TOKEN_ADDRESS;
    if (!wbtcTokenAddress) throw new Error('WBTC_TOKEN_ADDRESS not set in env');

    const {sender, receiver} = ctx.pair;
    const paymentPayload = `starknet:${receiver.starknetAddress}?amount=${TRANSFER_AMOUNT_SATS}&token=${wbtcTokenAddress}`;

    const buildBody = await sender.post<BuildPaymentResponse>(
      '/api/payment/pay/build',
      {paymentPayload},
      'POST /api/payment/pay/build',
    );

    expect(buildBody.buildId).toBeDefined();
    expect(buildBody.messageHash).toMatch(/^0x/);
    expect(buildBody.payment.network).toBe('starknet');

    ctx.totalFeeSats = buildBody.payment.fee.value;
    ctx.bimFeeSats = buildBody.payment.bimFee.value;

    const assertion = await sender.signAssertion(
      buildBody.messageHash,
      buildBody.credentialId,
      rpId(),
      origin(),
    );

    const execBody = await sender.post<StarknetPaymentResultResponse>(
      '/api/payment/pay/execute',
      {buildId: buildBody.buildId, assertion},
      'POST /api/payment/pay/execute',
    );

    expect(execBody.network).toBe('starknet');
    expect(execBody.txHash).toMatch(/^0x/);
    ctx.txHash = execBody.txHash;
    ctx.endTime = Date.now();
    log.info({txHash: ctx.txHash}, 'Starknet transfer executed');
  });

  it('receiver balance increased after transfer', async () => {
    await new Promise(resolve => setTimeout(resolve, 10_000));

    await ctx.pair.sender.fetchBalance();
    await ctx.pair.receiver.fetchBalance();

    const expectedMin = ctx.pair.receiver.initialWbtcBalance + BigInt(TRANSFER_AMOUNT_SATS);
    expect(ctx.pair.receiver.getCurrentWbtcBalance()).toBeGreaterThanOrEqual(expectedMin);
  });

  it('treasury collected the BIM fee', async () => {
    const result = await assertTreasuryFeeCollected(
      log, ctx.treasuryWbtcBefore, BigInt(ctx.bimFeeSats));
    ctx.treasuryCollected = result.collected;
    ctx.treasuryCheckPassed = result.passed;
    ctx.treasuryWbtcAfter = result.after;
  });

  it('report', async () => { // NOSONAR
    ctx.treasuryStrkAfter = await fetchTreasuryStrkBalance();
    ctx.avnuCreditsAfter = await pollAvnuCreditsAfter(getAvnuCredits, ctx.avnuCreditsBefore, log) ?? ctx.avnuCreditsBefore;

    const bimFeeExpectedSats = BigInt(ctx.bimFeeSats);
    const report = buildTransferReport({
      title: '02 — Starknet Transfer',
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
