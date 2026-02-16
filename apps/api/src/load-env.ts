import {config} from 'dotenv';
import {expand} from 'dotenv-expand';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';

const dirname: string = import.meta.dirname;

/**
 * Loads environment variables for the given network.
 *
 * Loading order (dotenv does NOT override existing vars):
 *   1. .env.{network}.secret  — secrets (git ignored)
 *   2. .env.{network}         — defaults (committed)
 *
 * @param env - Environment name (e.g. 'testnet', 'mainnet'). Falls back to NETWORK.
 */
export function loadEnv(env?: string): void {
  const network = env ?? process.env.NETWORK;
  if (!network) {
    throw new Error(
      'NETWORK is not set. Use NETWORK=testnet or NETWORK=mainnet.',
    );
  }

  const base = resolve(dirname, `../.env.${network}`);
  const secret = `${base}.secret`;

  if (!existsSync(secret)) {
    throw new Error(
      `Missing ${secret}\nCreate it with your secrets (e.g. AVNU_API_KEY=xxx). See .env.${network} for reference.`,
    );
  }

  // Load .secret first (secrets), then base (defaults — won't override)
  expand(config({path: secret}));
  expand(config({path: base}));
}
