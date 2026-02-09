import type {TestProject} from 'vitest/node';
import {loadEnv} from '../../../src/load-env';
import {TestDatabase} from '../../integration/helpers';

/**
 * Global setup for testnet tests.
 *
 * 1. Loads configuration from .env.testnet.local + .env.testnet
 * 2. Overrides test-specific values (NODE_ENV, STARKNET_NETWORK)
 * 3. Starts a PostgreSQL container (via TestContainers)
 */
export default async function globalSetup(_ctx: TestProject) {
  console.log('🔧 Testnet global setup');

  loadEnv('testnet');

  // Test-specific overrides
  process.env.NODE_ENV = 'test';
  process.env.STARKNET_NETWORK = 'testnet';

  // TestDatabase sets process.env.DATABASE_URL (overrides .env.testnet value)
  const db = await TestDatabase.create();

  console.log('Setup complete.\n');
  return async () => {
    console.log('🧹 Testnet global teardown');
    await db.shutdown();
  };
}
