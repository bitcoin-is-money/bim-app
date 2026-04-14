import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatTokenAmount} from '@bim/lib/token';
import type {Logger} from 'pino';
import type {Prices} from './e2e-rpc.js';
import type {UserReportSummary} from './e2e-user.js';

// =============================================================================
// Types
// =============================================================================

export type TestStatus = 'PASS' | 'FAIL';

export interface TransferReportData {
  title: string;
  status: TestStatus;
  transferAmountSats: string;
  bimFeePercent: string;
  bimFeeExpectedSats: bigint;
  bimFeeGotSats: bigint;
  bimFeeCheckPassed: boolean;
  lpFeeSats: bigint;
  totalFeeSats: bigint;
  txHash: string;
  sender: UserReportSummary;
  receiver: UserReportSummary;
  treasuryWbtcBefore: bigint;
  treasuryWbtcAfter: bigint;
  treasuryStrkBefore: bigint;
  treasuryStrkAfter: bigint;
  avnuCreditsBefore: bigint | undefined;
  avnuCreditsAfter: bigint | undefined;
  prices?: Prices;
  durationSeconds: number;
}

export interface DeployReportData {
  title: string;
  status: TestStatus;
  username: string;
  starknetAddress: string;
  txHash: string;
  durationSeconds: number;
  avnuCreditsBefore: string;
  avnuCreditsAfter: string;
}

export interface FailReportData {
  title: string;
  durationSeconds: number;
  error: unknown;
  sender?: UserReportSummary;
  receiver?: UserReportSummary;
}

// =============================================================================
// Report builders
// =============================================================================

export function formatAvnuCredits(wei: bigint | undefined): string {
  if (wei === undefined) return 'N/A';
  return formatTokenAmount(wei, 18, {fractionDigits: 6});
}

function pad(label: string, value: string, width: number): string {
  return `│  ${label}${value.padStart(width - label.length - 4)}  │`;
}

/**
 * Three-column row: label (left-aligned), col1 and col2 (right-aligned) with
 * fixed trailing margin. Used for Fees (Expected/Got) and Balances (Before/After).
 */
function row3(
  label: string,
  col1: string,
  col2: string,
  width: number,
  col1Width = 12,
  col2Width = 12,
): string {
  const inner = width - 4;
  const trailing = 2;
  const labelWidth = inner - col1Width - col2Width - trailing;
  return `│  ${label.padEnd(labelWidth)}${col1.padStart(col1Width)}${col2.padStart(col2Width)}${' '.repeat(trailing)}  │`;
}

function formatStrk(wei: bigint): string {
  return formatTokenAmount(wei, 18, {fractionDigits: 6});
}

function formatSats(sats: bigint): string {
  return `${sats.toString()} sats`;
}

/**
 * Gas consumed by the transfer, in STRK, computed from AVNU credits delta.
 * Returns undefined when credits are missing or unchanged (polling timed out).
 */
function computeGasStrk(
  before: bigint | undefined,
  after: bigint | undefined,
): number | undefined {
  if (before === undefined || after === undefined) return undefined;
  if (before === after) return undefined;
  return Number(before - after) / 1e18;
}

/**
 * Test cost in USD = LP fee (sats → BTC → USD) + gas (STRK → USD).
 * Returns undefined when prices or gas are unavailable.
 */
function computeTestCostUsd(
  lpFeeSats: bigint,
  gasStrk: number | undefined,
  prices: Prices | undefined,
): number | undefined {
  if (!prices || gasStrk === undefined) return undefined;
  const lpFeeUsd = (Number(lpFeeSats) / 1e8) * prices.btcUsd;
  const gasUsd = gasStrk * prices.strkUsd;
  return lpFeeUsd + gasUsd;
}

function line(text: string, width: number): string {
  const inner = width - 4;
  const truncated = text.length > inner ? text.slice(0, inner) : text;
  return `│  ${truncated.padEnd(inner)}  │`;
}

function statusLabel(status: TestStatus): string {
  return status === 'PASS' ? 'PASS ✓' : 'FAILED ✗';
}

function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  let remaining = text.replace(/\s+/g, ' ').trim();
  while (remaining.length > width) {
    let breakPoint = remaining.lastIndexOf(' ', width);
    if (breakPoint <= 0) breakPoint = width;
    out.push(remaining.slice(0, breakPoint));
    remaining = remaining.slice(breakPoint).trimStart();
  }
  if (remaining.length > 0) out.push(remaining);
  return out;
}

interface ExtractedErrorInfo {
  readonly message: string;
  readonly cause?: string;
  readonly stack?: string;
}

/**
 * Replaces absolute paths rooted at the current working directory with
 * their project-relative form, so error reports don't leak the developer's
 * local filesystem layout.
 */
function stripCwd(text: string): string {
  return text.replaceAll(process.cwd() + '/', '');
}

function extractErrorInfo(err: unknown): ExtractedErrorInfo {
  if (err === undefined || err === null) {
    return {message: '(no error captured — test failed before error could be recorded)'};
  }
  if (err instanceof Error) {
    const causeRaw: unknown = (err as Error & {cause?: unknown}).cause;
    const cause =
      causeRaw instanceof Error ? causeRaw.message :
      typeof causeRaw === 'string' ? causeRaw :
      causeRaw === undefined ? undefined :
      JSON.stringify(causeRaw);
    const stackLines = err.stack?.split('\n') ?? [];
    const firstFrame = stackLines.find(l => l.trim().startsWith('at '))?.trim();
    return {
      message: stripCwd(err.message || err.name || 'Error'),
      ...(cause !== undefined && {cause: stripCwd(cause)}),
      ...(firstFrame !== undefined && {stack: stripCwd(firstFrame)}),
    };
  }
  if (typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    const msg = typeof obj.message === 'string' ? obj.message : JSON.stringify(err);
    return {message: msg};
  }
  if (typeof err === 'string') return {message: err};
  return {message: JSON.stringify(err) ?? 'unknown error'};
}

function hasSwapInfo(summary: UserReportSummary): boolean {
  return summary.bimStatus !== undefined || summary.swapDirection !== undefined;
}

function swapLine(role: string, summary: UserReportSummary, width: number): string {
  const direction = summary.swapDirection ?? 'n/a';
  const status = summary.bimStatus ?? 'n/a';
  return pad(`  ${role} (${direction}):`, status, width);
}

export function buildTransferReport(data: TransferReportData): string {
  const w = 82;
  const hr = '├' + '─'.repeat(w) + '┤';
  const top = '┌' + '─'.repeat(w) + '┐';
  const bot = '└' + '─'.repeat(w) + '┘';
  const direction = `${data.sender.username} → ${data.receiver.username}`;

  // Fees section
  const bimCheckIcon = data.bimFeeCheckPassed ? '✓' : '✗';
  const bimExpected = formatSats(data.bimFeeExpectedSats);
  const bimGot = formatSats(data.bimFeeGotSats);
  const lpFee = formatSats(data.lpFeeSats);
  const totalFee = formatSats(data.totalFeeSats);

  // Custom BIM fee row: the check icon goes into the trailing margin so that
  // "sats" of bimGot aligns with "sats" of the other fee rows (LP, total, etc.).
  const bimInner = w - 4;
  const bimCol1W = 12;
  const bimCol2W = 12;
  const bimLabelW = bimInner - bimCol1W - bimCol2W - 2;
  const bimFeeLabel = `  BIM fee (${data.bimFeePercent}):`;
  const bimFeeRow = `│  ${bimFeeLabel.padEnd(bimLabelW)}${bimExpected.padStart(bimCol1W)}${bimGot.padStart(bimCol2W)} ${bimCheckIcon}  │`;

  const gasStrk = computeGasStrk(data.avnuCreditsBefore, data.avnuCreditsAfter);
  const gasCol = gasStrk !== undefined ? `${gasStrk.toFixed(4)} strk` : 'n/a';

  const testCostUsd = computeTestCostUsd(data.lpFeeSats, gasStrk, data.prices);
  const testCostCol = testCostUsd !== undefined ? `${testCostUsd.toFixed(4)} usd` : 'n/a';

  // Balances section
  const bimWbtcBefore = data.treasuryWbtcBefore.toString();
  const bimWbtcAfter = data.treasuryWbtcAfter.toString();
  const bimStrkBefore = formatStrk(data.treasuryStrkBefore);
  const bimStrkAfter = formatStrk(data.treasuryStrkAfter);
  const avnuBefore = data.avnuCreditsBefore !== undefined ? formatStrk(data.avnuCreditsBefore) : 'n/a';
  const avnuAfter = data.avnuCreditsAfter !== undefined ? formatStrk(data.avnuCreditsAfter) : 'n/a';

  const senderWbtcBefore = data.sender.initialWbtcBalance.toString();
  const senderWbtcAfter = data.sender.currentWbtcBalance.toString();
  const senderStrkBefore = formatStrk(data.sender.initialStrkBalance);
  const senderStrkAfter = formatStrk(data.sender.currentStrkBalance);

  const receiverWbtcBefore = data.receiver.initialWbtcBalance.toString();
  const receiverWbtcAfter = data.receiver.currentWbtcBalance.toString();
  const receiverStrkBefore = formatStrk(data.receiver.initialStrkBalance);
  const receiverStrkAfter = formatStrk(data.receiver.currentStrkBalance);

  const lines = [
    top,
    pad(data.title, statusLabel(data.status), w),
    pad('Duration: ', `${data.durationSeconds}s`, w),
    hr,
    pad('Transfer:  ', `${data.transferAmountSats} sats  (${direction})`, w),
    pad('Tx hash:   ', data.txHash, w),
    hr,
    row3('Fees', 'Expected', 'Got', w),
    bimFeeRow,
    row3('  LP fee:', '', lpFee, w),
    row3('  Total user fee:', '', totalFee, w),
    row3('  Gas (avnu diff treasury):', '', gasCol, w),
    row3('  Test cost (LP fee + gas):', '', testCostCol, w),
    hr,
    row3('BIM treasury', 'Before', 'After', w),
    row3('  wbtc:', bimWbtcBefore, bimWbtcAfter, w),
    row3('  strk:', bimStrkBefore, bimStrkAfter, w),
    line('AVNU treasury:', w),
    row3('  strk:', avnuBefore, avnuAfter, w),
    line('E2E sender account:', w),
    row3('  wbtc:', senderWbtcBefore, senderWbtcAfter, w),
    row3('  strk:', senderStrkBefore, senderStrkAfter, w),
    line('E2E receiver account:', w),
    row3('  wbtc:', receiverWbtcBefore, receiverWbtcAfter, w),
    row3('  strk:', receiverStrkBefore, receiverStrkAfter, w),
  ];

  if (hasSwapInfo(data.sender) || hasSwapInfo(data.receiver)) {
    lines.push(hr);
    lines.push(pad('Swaps (BIM status)', '', w));
    lines.push(swapLine('Sender  ', data.sender, w));
    lines.push(swapLine('Receiver', data.receiver, w));
  }

  lines.push(bot);
  return lines.join('\n');
}

export function buildDeployReport(data: DeployReportData): string {
  const w = 82;
  const hr = '├' + '─'.repeat(w) + '┤';
  const top = '┌' + '─'.repeat(w) + '┐';
  const bot = '└' + '─'.repeat(w) + '┘';

  const lines = [
    top,
    pad(data.title, statusLabel(data.status), w),
    pad('Duration: ', `${data.durationSeconds}s`, w),
    hr,
    pad('Username:  ', data.username, w),
    pad('Address:   ', data.starknetAddress, w),
    pad('Tx hash:   ', data.txHash, w),
    hr,
    pad('Treasury:  ', 'unchanged', w),
    pad('AVNU credits:', `${data.avnuCreditsBefore} → ${data.avnuCreditsAfter} STRK`, w),
    bot,
  ];

  return lines.join('\n');
}

export function buildFailReport(data: FailReportData): string {
  const w = 82;
  const hr = '├' + '─'.repeat(w) + '┤';
  const top = '┌' + '─'.repeat(w) + '┐';
  const bot = '└' + '─'.repeat(w) + '┘';
  const info = extractErrorInfo(data.error);

  const lines: string[] = [
    top,
    pad(data.title, statusLabel('FAIL'), w),
    pad('Duration: ', `${data.durationSeconds}s`, w),
    hr,
    line('Error', w),
  ];

  const addLabeled = (label: string, text: string): void => {
    const labelStr = `  ${label.padEnd(10)}`;
    const textWidth = (w - 4) - labelStr.length;
    const [first, ...rest] = wrap(text, textWidth);
    if (first === undefined) return;
    lines.push(line(labelStr + first, w));
    const contIndent = ' '.repeat(labelStr.length);
    for (const cont of rest) {
      lines.push(line(contIndent + cont, w));
    }
  };

  addLabeled('Message:', info.message);
  if (info.cause !== undefined) addLabeled('Cause:', info.cause);
  if (info.stack !== undefined) addLabeled('At:', info.stack);

  if (data.sender !== undefined && hasSwapInfo(data.sender)
    || data.receiver !== undefined && hasSwapInfo(data.receiver)) {
    lines.push(hr);
    lines.push(pad('Swaps (BIM status)', '', w));
    if (data.sender !== undefined) lines.push(swapLine('Sender  ', data.sender, w));
    if (data.receiver !== undefined) lines.push(swapLine('Receiver', data.receiver, w));
  }

  lines.push(bot);
  return lines.join('\n');
}

// =============================================================================
// AVNU credits polling
// =============================================================================

/**
 * Polls AVNU credits until the value differs from `before`, or 2 minutes elapse.
 * Returns the updated value, or `before` if unchanged after timeout.
 */
export async function pollAvnuCreditsAfter(
  getCredits: () => Promise<bigint | undefined>,
  before: bigint | undefined,
  rootLogger: Logger,
): Promise<bigint | undefined> {
  if (before === undefined) return getCredits();
  const log = rootLogger.child({name: 'e2e-report.ts'});
  const maxAttempts = 24;
  const intervalMs = 5_000;
  log.info('Waiting for AVNU credits to update (max 2 min)...');

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const current = await getCredits();
    if (current !== undefined && current !== before) {
      log.info({credits: formatAvnuCredits(current), elapsedSeconds: attempt * intervalMs / 1_000}, 'AVNU credits updated');
      return current;
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  log.warn('AVNU credits unchanged after 2 min — using initial value');
  return before;
}

// =============================================================================
// Slack
// =============================================================================

interface SlackSecrets {
  readonly botToken: string;
}

function loadSlackSecrets(): SlackSecrets | undefined {
  try {
    const cliDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', 'apps', 'cli');
    const raw = readFileSync(join(cliDir, '.secrets.json'), 'utf-8');
    const secrets = JSON.parse(raw) as {slack?: SlackSecrets};
    return secrets.slack;
  } catch {
    return undefined;
  }
}

export async function sendSlackReport(log: Logger, report: string): Promise<void> {
  const slack = loadSlackSecrets();
  if (!slack) {
    log.warn('No Slack config in .secrets.json — skipping report');
    return;
  }

  const channel = process.env.MONITORING_SLACK_CHANNEL;
  if (!channel) {
    log.warn('MONITORING_SLACK_CHANNEL not set — skipping report');
    return;
  }

  try {
    const {SlackAPIClient} = await import('slack-web-api-client');
    const client = new SlackAPIClient(slack.botToken);
    await client.chat.postMessage({
      channel,
      text: `\`\`\`\n${report}\n\`\`\``,
    });
    log.info('Report sent to Slack');
  } catch (err: unknown) {
    log.warn({err}, 'Failed to send Slack report (non-fatal)');
  }
}
