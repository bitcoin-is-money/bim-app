import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 10_000,
    typecheck: {
      enabled: true,
      tsconfig: './tsconfig.json',
      include: ['test/**/*.test.ts'],
    },
    coverage: {
      provider: 'v8',
      reporter: ['lcov', 'text-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      // Adapter file: no unit test by project convention — exercised via API
      // integration tests. The pure mapping and error helpers are tested here.
      exclude: ['**/*.test.ts', '**/test/**', 'dist/**', 'node_modules/**', 'src/atomiq.gateway.ts', 'src/index.ts'],
    },
  },
});
