import type {
  AccountRepository,
  AtomiqGateway,
  ChallengeRepository,
  PaymasterGateway,
  SessionRepository,
  StarknetGateway,
  SwapRepository,
  TransactionRepository,
  UserSettingsRepository,
  WatchedAddressRepository,
  WebAuthnGateway,
} from '@bim/domain';
import type {DeepPartial} from '@bim/lib';
import {describe, expect, it} from 'vitest';
import {AppContext} from '../../src/app-context.js';

/**
 * Creates a mock AppContext for testing.
 */
function createMockContext(): AppContext {
  return {
    repositories: {
      account: {name: 'default-account'} as unknown as AccountRepository,
      session: {name: 'default-session'} as unknown as SessionRepository,
      challenge: {name: 'default-challenge'} as unknown as ChallengeRepository,
      swap: {name: 'default-swap'} as unknown as SwapRepository,
      userSettings: {name: 'default-userSettings'} as unknown as UserSettingsRepository,
      watchedAddress: {name: 'default-watchedAddress'} as unknown as WatchedAddressRepository,
      transaction: {name: 'default-transaction'} as unknown as TransactionRepository,
    },
    gateways: {
      webAuthn: {name: 'default-webAuthn'} as unknown as WebAuthnGateway,
      starknet: {name: 'default-starknet'} as unknown as StarknetGateway,
      paymaster: {name: 'default-paymaster'} as unknown as PaymasterGateway,
      atomiq: {name: 'default-atomiq'} as unknown as AtomiqGateway,
    },
    webauthn: {
      rpId: 'default-rpId',
      rpName: 'default-rpName',
      origin: 'http://default-origin',
    }
  };
}

describe('AppContext', () => {
  describe('mergeContext', () => {
    it('returns base context when override is undefined', () => {
      const base = createMockContext();

      const result = AppContext.mergeContext(base, undefined);

      expect(result).toBe(base);
    });

    it('overrides a single gateway', () => {
      const base = createMockContext();
      const overrideStarknet = {name: 'override-starknet'} as unknown as StarknetGateway;
      const override: DeepPartial<AppContext> = {
        gateways: {
          starknet: overrideStarknet,
        }
      };

      const result = AppContext.mergeContext(base, override);

      expect((result.gateways.starknet as any).name).toBe('override-starknet');
      // Other gateways should remain unchanged
      expect((result.gateways.paymaster as any).name).toBe('default-paymaster');
      expect((result.gateways.webAuthn as any).name).toBe('default-webAuthn');
      expect((result.gateways.atomiq as any).name).toBe('default-atomiq');
    });

    it('overrides multiple gateways', () => {
      const base = createMockContext();
      const override: DeepPartial<AppContext> = {
        gateways: {
          starknet: {name: 'override-starknet'} as unknown as StarknetGateway,
          paymaster: {name: 'override-paymaster'} as unknown as PaymasterGateway,
        }
      };

      const result = AppContext.mergeContext(base, override);

      expect((result.gateways.starknet as any).name).toBe('override-starknet');
      expect((result.gateways.paymaster as any).name).toBe('override-paymaster');
      // Other gateways remain unchanged
      expect((result.gateways.webAuthn as any).name).toBe('default-webAuthn');
      expect((result.gateways.atomiq as any).name).toBe('default-atomiq');
    });

    it('overrides a single repository', () => {
      const base = createMockContext();
      const override: DeepPartial<AppContext> = {
        repositories: {
          account: {name: 'override-account'} as unknown as AccountRepository,
        },
      };

      const result = AppContext.mergeContext(base, override);

      expect((result.repositories.account as any).name).toBe('override-account');
      // Other repositories remain unchanged
      expect((result.repositories.session as any).name).toBe('default-session');
    });

    it('overrides webauthn config (plain object - deep merged)', () => {
      const base = createMockContext();
      const override: DeepPartial<AppContext> = {
        webauthn: {
          rpId: 'override-rpId',
        },
      };

      const result = AppContext.mergeContext(base, override);

      // rpId is overridden
      expect(result.webauthn.rpId).toBe('override-rpId');
      // Other webauthn fields remain from base (deep merge)
      expect(result.webauthn.rpName).toBe('default-rpName');
      expect(result.webauthn.origin).toBe('http://default-origin');
    });

    it('overrides gateways and repositories together', () => {
      const base = createMockContext();
      const override: DeepPartial<AppContext> = {
        gateways: {
          starknet: {name: 'override-starknet'} as unknown as StarknetGateway,
        },
        repositories: {
          account: {name: 'override-account'} as unknown as AccountRepository,
        },
      };

      const result = AppContext.mergeContext(base, override);

      expect((result.gateways.starknet as any).name).toBe('override-starknet');
      expect((result.repositories.account as any).name).toBe('override-account');
      // Others remain unchanged
      expect((result.gateways.paymaster as any).name).toBe('default-paymaster');
      expect((result.repositories.session as any).name).toBe('default-session');
    });

    it('does not mutate the base context', () => {
      const base = createMockContext();
      const originalStarknetName = (base.gateways.starknet as any).name;
      const override: DeepPartial<AppContext> = {
        gateways: {
          starknet: {name: 'override-starknet'} as unknown as StarknetGateway,
        },
      };

      AppContext.mergeContext(base, override);

      // Base should not be mutated
      expect((base.gateways.starknet as any).name).toBe(originalStarknetName);
    });

    it('replaces class instances instead of deep-merging them', () => {
      // Simulate class instances with the internal state
      class MockGateway {
        constructor(readonly config: {url: string; timeout: number}) {}
      }

      const base = createMockContext();
      base.gateways.starknet = new MockGateway({
        url: 'http://default',
        timeout: 1000,
      }) as unknown as StarknetGateway;

      const overrideGateway = new MockGateway({
        url: 'http://override',
        timeout: 2000,
      });

      const override: DeepPartial<AppContext> = {
        gateways: {
          starknet: overrideGateway as unknown as StarknetGateway,
        },
      };

      const result = AppContext.mergeContext(base, override);

      // The gateway should be replaced entirely, not merged
      expect(result.gateways.starknet).toBe(overrideGateway);
      expect((result.gateways.starknet as unknown as MockGateway).config.url).toBe('http://override');
      expect((result.gateways.starknet as unknown as MockGateway).config.timeout).toBe(2000);
    });

    it('handles class instances with circular references without hanging', () => {
      // Create a class with the circular reference (like RpcProvider)
      class CircularGateway {
        self: CircularGateway;
        constructor(readonly name: string) {
          this.self = this;
        }
      }

      const base = createMockContext();
      base.gateways.starknet = new CircularGateway('default') as unknown as StarknetGateway;

      const overrideGateway = new CircularGateway('override');
      const override: DeepPartial<AppContext> = {
        gateways: {
          starknet: overrideGateway as unknown as StarknetGateway,
        },
      };

      // This should NOT hang or throw - class instances are replaced, not merged
      const result = AppContext.mergeContext(base, override);

      expect((result.gateways.starknet as unknown as CircularGateway).name).toBe('override');
      expect(result.gateways.starknet).toBe(overrideGateway);
    });
  });
});
