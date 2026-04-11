import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.ts'],
    typecheck: {
      enabled: true,
      tsconfig: './tsconfig.json',
      include: ['test/unit/**/*.test.ts'],
    },
  }
});
