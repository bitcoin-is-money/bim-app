import {config} from 'dotenv';
import {expand} from 'dotenv-expand';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';

const dirname: string = import.meta.dirname;

/**
 * Loads environment variables for the given BIM environment.
 *
 * Loading order (dotenv does NOT override existing vars):
 *   1. .env.{bimEnv}.local  — secrets (git ignored)
 *   2. .env.{bimEnv}        — defaults (committed)
 *
 * @param env - Environment name (e.g. 'testnet', 'mainnet'). Falls back to BIM_ENV.
 */
export function loadEnv(env?: string): void {
  const bimEnv = env ?? process.env.BIM_ENV;
  if (!bimEnv) {
    throw new Error(
      'BIM_ENV is not set. Use BIM_ENV=testnet or BIM_ENV=mainnet.',
    );
  }

  const base = resolve(dirname, `../.env.${bimEnv}`);
  const local = `${base}.local`;

  if (!existsSync(local)) {
    throw new Error(
      `Missing ${local}\nCreate it with your secrets (e.g. AVNU_API_KEY=xxx). See .env.${bimEnv} for reference.`,
    );
  }

  // Load .local first (secrets), then base (defaults — won't override)
  expand(config({path: local}));
  expand(config({path: base}));
}
