import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    root: './',
    include: ['src/test/**/*.test.ts'],
    environment: 'jsdom',
    watch: false,
    typecheck: {
      enabled: true,
      tsconfig: './tsconfig.json',
      include: ['src/test/**/*.test.ts'],
    },
    coverage: {
      provider: 'v8',
      reporter: ['lcov', 'text-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: ['**/*.test.ts', 'src/test/**', 'dist/**', 'node_modules/**'],
    },
  }
});
