import {type Network, STRK_DECIMALS} from '../config/constants.js';
import {loadSecrets, requireAvnu, requireTreasury} from '../config/secrets.js';
import {formatStrk} from '../lib/format.js';
import {createProvider, getStrkBalance} from '../lib/starknet.js';

const AVNU_API_URLS: Record<Network, string> = {
  testnet: 'https://sepolia.api.avnu.fi',
  mainnet: 'https://starknet.api.avnu.fi',
};

function parseNetwork(args: string[]): Network {
  const arg = args[0];
  if (arg !== 'testnet' && arg !== 'mainnet') {
    console.error('Usage: ./bim treasury:balance <testnet|mainnet>');
    process.exit(1);
  }
  return arg;
}

async function getAvnuCredits(network: Network, apiKey: string): Promise<bigint | undefined> {
  try {
    const response = await fetch(`${AVNU_API_URLS[network]}/paymaster/v1/sponsor-activity`, {
      headers: {'api-key': apiKey},
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status !== 200) return undefined;

    const body = await response.json() as {remainingStrkCredits?: string};
    if (body.remainingStrkCredits === undefined) return undefined;

    return BigInt(body.remainingStrkCredits);
  } catch {
    return undefined;
  }
}

export async function run(args: string[]): Promise<void> {
  const network = parseNetwork(args);
  const secrets = loadSecrets();
  const treasury = requireTreasury(secrets, network);
  const provider = createProvider(network);

  const adminBalance = await getStrkBalance(provider, treasury.address);

  console.log(`Network:  ${network}`);
  console.log();
  console.log('-- Treasury --');
  console.log(`Address:  ${treasury.address}`);
  console.log(`Balance:  ${formatStrk(adminBalance)}`);
  console.log();

  // AVNU paymaster credits (requires API key)
  const avnu = secrets.avnu;
  if (avnu) {
    const credits = await getAvnuCredits(network, avnu.apiKey);
    console.log('-- AVNU Paymaster Credits --');
    if (credits !== undefined) {
      console.log(`Credits:  ${formatStrk(credits)}`);
    } else {
      console.log('Credits:  (unable to fetch — check API key)');
    }
  } else {
    console.log('-- AVNU --');
    console.log('No AVNU config in .secrets.json — skipping credit check.');
  }
}
