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
      // Gateway adapters: no unit test per project convention — covered by
      // API integration tests. Pure helpers (argent-calldata, signature
      // processor) are tested here.
      exclude: [
        '**/*.test.ts', '**/test/**', 'dist/**', 'node_modules/**',
        'src/index.ts',
        // Gateway adapters — exercised by API integration tests.
        'src/avnu-paymaster.gateway.ts',
        'src/avnu-swap.gateway.ts',
        'src/starknet-rpc.gateway.ts',
        // Crypto signature builder: requires end-to-end WebAuthn fixtures
        // (authenticatorData, clientDataJSON, DER signature, recovery bit).
        // Covered by API integration tests that go through a real WebAuthn
        // virtual authenticator flow.
        'src/webauthn-signature.processor.ts',
      ],
    },
  },
});
