import {run as treasuryCreate} from './commands/treasury-create.js';
import {run as treasuryDeploy} from './commands/treasury-deploy.js';
import accountBalance from './commands/account-balance.js';
import {run as avnuRefund} from './commands/avnu-refund.js';
import {run as e2eInit} from './commands/e2e-init.js';
import {run as e2eFund} from './commands/e2e-fund.js';
import {run as slackTest} from './commands/slack-test.js';
import {run as deployerCreate} from './commands/deployer-create.js';
import {run as deployerDeploy} from './commands/deployer-deploy.js';
import {run as contractCheck} from './commands/contract-check.js';
import {run as contractDeclare} from './commands/contract-declare.js';
import {run as apiHealth} from './commands/api-health.js';

// =============================================================================
// Command registry
// =============================================================================

interface Command {
  run: (args: string[]) => Promise<void>;
  help: string;
}

const COMMANDS: Record<string, Command> = {
  'treasury:create':   {run: treasuryCreate,  help: 'Create treasury account            <network>'},
  'treasury:deploy':   {run: treasuryDeploy,  help: 'Deploy treasury account            <network>'},
  'account:balance':   {run: accountBalance,  help: 'Show all account balances          [network=mainnet] [--json]'},
  'avnu:refund':       {run: avnuRefund,      help: 'Refund AVNU paymaster credits      [amount_strk]'},
  'e2e:init':          {run: e2eInit,         help: 'Create E2E test accounts (once)'},
  'e2e:fund':          {run: e2eFund,         help: 'Fund E2E account with WBTC          <a|b> [amount_sats]'},
  'slack:test':        {run: slackTest,       help: 'Send test Slack messages'},
  'deployer:create':   {run: deployerCreate,  help: 'Create deployer account (Sepolia)'},
  'deployer:deploy':   {run: deployerDeploy,  help: 'Deploy deployer account (Sepolia)'},
  'contract:check':    {run: contractCheck,   help: 'Check BIM Argent contract declaration status'},
  'contract:declare':  {run: contractDeclare, help: 'Declare BIM Argent contract (Sepolia)'},
  'api:health':        {run: apiHealth,       help: 'Check API server health             [url] [--json]'},
};

// =============================================================================
// Help
// =============================================================================

function printHelp(): void {
  console.log('BIM CLI\n');
  console.log('Usage: ./bim <command> [args]\n');
  console.log('Commands:');
  for (const [name, cmd] of Object.entries(COMMANDS)) {
    console.log(`  ${name.padEnd(20)} ${cmd.help}`);
  }
  console.log();
}

// =============================================================================
// Main
// =============================================================================

const commandName = process.argv[2];
const commandArgs = process.argv.slice(3);

if (!commandName || commandName === 'help' || commandName === '--help') {
  printHelp();
  process.exit(0);
}

const command = COMMANDS[commandName];
if (!command) {
  console.error(`Unknown command: ${commandName}\n`);
  printHelp();
  process.exit(1);
}

command.run(commandArgs).catch((err: unknown) => {
  console.error('Failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
