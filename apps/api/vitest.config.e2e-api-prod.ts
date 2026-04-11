import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/e2e-api-prod/**/*.test.ts'],
    globalSetup: './test/e2e-api-prod/helpers/global-setup.ts',
    pool: 'forks',
    isolate: false,
    fileParallelism: false,
    bail: 1,
    testTimeout: 60 * 60 * 1000, // 60 min (Bitcoin swap 45 min + report polling)
    hookTimeout: 5 * 60 * 1000,
    sequence: {
      shuffle: false,
    },
    typecheck: {
      enabled: true,
      tsconfig: './tsconfig.json',
      include: ['test/e2e-api-prod/**/*.test.ts'],
    },
  },
});
