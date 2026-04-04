import {config} from 'dotenv';
import {expand} from 'dotenv-expand';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';

const dirname: string = import.meta.dirname;

/**
 * Loads environment variables for the given network.
 *
 * Loading order:
 *   1. .env.local — dev overrides and secrets (gitignored, optional)
 *   2. config/{network}.env — blockchain constants (committed)
 *
 * In production (Docker/Scaleway), .env.local is absent.
 * Terraform injects infra-dependent values (WEBAUTHN_*, DATABASE_URL, etc.)
 * as container environment variables — they take precedence
 * over dotenv since dotenv never overrides existing vars.
 *
 * @param network - Network name ('testnet' or 'mainnet'). Falls back to NETWORK env var.
 */
export function loadEnv(network?: string): void {
  const resolvedNetwork = network ?? process.env.NETWORK;
  if (!resolvedNetwork) {
    throw new Error(
      'NETWORK is not set. Use NETWORK=testnet or NETWORK=mainnet.',
    );
  }

  // 1. Local dev overrides (optional — absent in Docker)
  const localEnv = resolve(dirname, '../.env.local');
  if (existsSync(localEnv)) {
    expand(config({path: localEnv}));
  }

  // 2. Blockchain constants (always present — committed + copied into Docker)
  const networkEnv = resolve(dirname, `../config/${resolvedNetwork}.env`);
  if (!existsSync(networkEnv)) {
    throw new Error(
      `Network config not found: ${networkEnv}. Expected config/${resolvedNetwork}.env.`,
    );
  }
  expand(config({path: networkEnv}));
}
