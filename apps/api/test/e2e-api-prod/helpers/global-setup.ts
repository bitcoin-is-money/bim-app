import {config} from 'dotenv';
import {expand} from 'dotenv-expand';
import {resolve} from 'node:path';
import type {TestProject} from 'vitest/node';
import {createTestLogger} from '../../helpers/logger.helper.js';

const log = createTestLogger().child({name: 'global-setup.ts'});

/**
 * Global setup for E2E API production tests.
 *
 * Loads two env files directly (no runtime loadEnv — these tests hit the
 * remote prod API via HTTP and don't instantiate the full app):
 *   1. config/mainnet.env — blockchain constants (shared with prod)
 *   2. test/e2e-api-prod/e2e.env — prod-specific WebAuthn domain
 */
export default async function globalSetup(_ctx: TestProject): Promise<void> {
  log.info('E2E API prod global setup');

  const dirname: string = import.meta.dirname;
  const mainnetEnv = resolve(dirname, '../../../config/mainnet.env');
  const e2eEnv = resolve(dirname, '../e2e.env');

  expand(config({path: mainnetEnv}));
  expand(config({path: e2eEnv}));

  process.env.NODE_ENV = 'test';

  const origin = process.env.WEBAUTHN_ORIGIN;
  if (!origin) {
    throw new Error(
      `WEBAUTHN_ORIGIN not set after loading ${e2eEnv}. ` +
      'Set it to the production server URL (e.g. https://app.bitcoinismoney.app).',
    );
  }

  log.info({origin}, 'Setup complete');
}
