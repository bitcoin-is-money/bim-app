import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/testnet/**/*.test.ts'],
    globalSetup: './test/testnet/helpers/global-setup.ts',
    pool: 'forks',
    isolate: false, // Run all tests in the same fork (sequential)
    fileParallelism: false, // Don't run test files in parallel
    testTimeout: 120000, // 2 min — Sepolia transactions can be slow
    hookTimeout: 180000, // 3 min — container startup + schema push
    sequence: {
      shuffle: false, // Run in order
    },
    typecheck: {
      enabled: true,
      tsconfig: './tsconfig.json',
      include: ['test/testnet/**/*.test.ts'],
    },
  },
});
