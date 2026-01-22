import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/integration/**/*.test.ts'],
    globalSetup: './test/integration/helpers/global-setup.ts',
    pool: 'forks',
    isolate: false, // Run all tests in the same fork (sequential)
    fileParallelism: false, // Don't run test files in parallel
    testTimeout: 60000, // Longer timeout for Starknet operations
    hookTimeout: 120000, // Longer timeout for setup/teardown (container startup)
    sequence: {
      shuffle: false, // Don't shuffle tests, run in order
    },
  },
});
