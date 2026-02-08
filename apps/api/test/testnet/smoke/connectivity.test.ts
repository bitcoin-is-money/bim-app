import {RpcProvider} from 'starknet';
import {describe, expect, it} from 'vitest';

/**
 * Smoke tests for testnet connectivity.
 *
 * All configuration comes from .env.testnet (loaded by global-setup.ts).
 *
 * These tests verify that the external services required for testnet tests
 * are reachable and properly configured. They should run first to catch
 * infrastructure issues before running more complex tests.
 */
describe('Testnet Connectivity', () => {

  describe('Starknet Sepolia RPC', () => {
    it('responds to starknet_chainId', async () => {
      const provider = new RpcProvider({nodeUrl: process.env.STARKNET_RPC_URL!});
      const chainId = await provider.getChainId();

      // Sepolia chain ID = "SN_SEPOLIA" encoded as felt
      expect(chainId).toBeDefined();
      expect(typeof chainId).toBe('string');
      expect(chainId.length).toBeGreaterThan(0);
    });

    it('returns a recent block number', async () => {
      const provider = new RpcProvider({nodeUrl: process.env.STARKNET_RPC_URL!});
      const block = await provider.getBlockLatestAccepted();

      expect(block.block_number).toBeGreaterThan(0);
    });
  });

  describe('AVNU Paymaster (Sepolia)', () => {
    it('is reachable via SNIP-29 JSON-RPC', async () => {
      const response = await fetch(process.env.AVNU_API_URL!, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'paymaster_isAvailable',
          params: {},
          id: 1,
        }),
        signal: AbortSignal.timeout(10000),
      });

      expect(response.status).toBe(200);
      const body = await response.json() as {result?: boolean};
      expect(body.result).toBe(true);
    });
  });

  describe('BIM Argent contract', () => {
    it('class hash is declared on Sepolia', async () => {
      const provider = new RpcProvider({nodeUrl: process.env.STARKNET_RPC_URL!});
      const classHash = process.env.ACCOUNT_CLASS_HASH!;

      try {
        const contractClass = await provider.getClass(classHash);
        expect(contractClass).toBeDefined();
        expect(contractClass).toHaveProperty('abi');
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `BIM Argent class hash is NOT declared on Sepolia.\n` +
          `Class hash: ${classHash}\n` +
          `Run: npx tsx scripts/bim-argent/declare-contract.ts\n` +
          `Original error: ${message}`
        );
      }
    });
  });
});
