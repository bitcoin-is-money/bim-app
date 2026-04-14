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
      // Only the model layer carries business logic worth covering on the front.
      // Components, pages, services, mocks, interceptors, guards and config are
      // either thin UI wiring or framework boilerplate — coverage there is noise.
      include: ['src/app/model/**/*.ts'],
      exclude: ['**/*.test.ts', 'src/test/**', 'dist/**', 'node_modules/**'],
    },
  }
});
