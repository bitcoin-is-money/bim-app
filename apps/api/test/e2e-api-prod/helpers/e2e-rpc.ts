import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {RpcProvider} from 'starknet';

const CLI_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', 'apps', 'cli');

/**
 * Reads an ERC-20 token balance via Starknet RPC.
 */
export async function getTokenBalance(
  rpcUrl: string,
  tokenAddress: string,
  accountAddress: string,
): Promise<bigint> {
  const provider = new RpcProvider({nodeUrl: rpcUrl});
  const result = await provider.callContract({
    contractAddress: tokenAddress,
    entrypoint: 'balanceOf',
    calldata: [accountAddress],
  });
  const raw = result[0];
  if (raw === undefined) throw new Error('balanceOf returned empty result');
  return BigInt(raw);
}

export interface Prices {
  readonly btcUsd: number;
  readonly strkUsd: number;
}

const COINGECKO_PRICE_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,starknet&vs_currencies=usd';

/**
 * Fetches BTC/USD and STRK/USD from CoinGecko.
 * Returns undefined on network error, non-OK response, or missing/invalid values.
 */
export async function fetchPrices(): Promise<Prices | undefined> {
  try {
    const response = await fetch(COINGECKO_PRICE_URL, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return undefined;
    const data = await response.json() as {
      bitcoin?: {usd?: number};
      starknet?: {usd?: number};
    };
    const btcUsd = data.bitcoin?.usd;
    const strkUsd = data.starknet?.usd;
    if (btcUsd === undefined || strkUsd === undefined || btcUsd <= 0 || strkUsd <= 0) {
      return undefined;
    }
    return {btcUsd, strkUsd};
  } catch {
    return undefined;
  }
}

/**
 * Fetches AVNU paymaster remaining STRK credits via the AVNU API.
 * Returns the balance in wei, or undefined if the API key is missing or the call fails.
 */
export async function getAvnuCredits(): Promise<bigint | undefined> {
  try {
    const raw = readFileSync(join(CLI_DIR, '.secrets.json'), 'utf-8');
    const secrets = JSON.parse(raw) as {avnu?: {apiKey: string}};
    const apiKey = secrets.avnu?.apiKey;
    if (!apiKey) return undefined;

    const response = await fetch('https://starknet.api.avnu.fi/paymaster/v1/sponsor-activity', {
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
