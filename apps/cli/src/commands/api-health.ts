import {checkApiHealth, type ServiceHealthEntry} from '../core';
import {bigintReplacer} from '../lib/format.js';

const DEFAULT_URL = 'https://app.bitcoinismoney.app';

function formatServiceLine(service: ServiceHealthEntry): string {
  const icon = service.status === 'healthy' ? '✓' : '✗';
  let line = `  ${icon} ${service.name}: ${service.status}`;
  if (service.downSince !== undefined) {
    line += ` (down since ${service.downSince})`;
  }
  if (service.lastError !== undefined) {
    line += ` — ${service.lastError.kind}: ${service.lastError.summary}`;
  }
  return line;
}

export async function run(args: string[]): Promise<void> {
  const jsonMode = args.includes('--json');
  const positional = args.find(a => !a.startsWith('--'));
  const baseUrl = (positional ?? DEFAULT_URL).replace(/\/+$/, '');

  const result = await checkApiHealth(baseUrl);

  if (jsonMode) {
    console.log(JSON.stringify(result, bigintReplacer, 2));
    return;
  }

  console.log(`Checking ${result.url} ...`);
  const icon = result.healthy ? '✓' : '✗';
  console.log(`\n  ${icon} Status: ${result.status} (HTTP ${result.httpStatus})`);
  console.log(`  Timestamp: ${result.timestamp}`);

  for (const [name, value] of Object.entries(result.checks)) {
    const checkIcon = value === 'ok' ? '✓' : '✗';
    console.log(`  ${checkIcon} ${name}: ${value}`);
  }

  if (result.services.length > 0) {
    console.log('\n  Services:');
    for (const service of result.services) {
      console.log(formatServiceLine(service));
    }
  }
  console.log();

  if (!result.healthy) process.exit(1);
}
