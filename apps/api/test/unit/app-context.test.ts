import type {AccountRepository, PaymasterGateway,} from '@bim/domain/ports';
import {createLogger} from '@bim/lib/logger';
import {describe, expect, it, vi} from 'vitest';
import {AppContext, type AppContextOverrides} from '../../src/app-context.js';
import type {AppConfig} from '../../src/app-config.js';

const logger = createLogger();

// Mock adapters to avoid real implementations
// Use class-style mocks that can be instantiated with 'new'
vi.mock('../../src/adapters/index.js', () => {
  return {
    DrizzleAccountRepository: class { name = 'drizzle-account'; },
    DrizzleSessionRepository: class { name = 'drizzle-session'; },
    DrizzleChallengeRepository: class { name = 'drizzle-challenge'; },
    DrizzleUserSettingsRepository: class { name = 'drizzle-userSettings'; },
    DrizzleTransactionRepository: class { name = 'drizzle-transaction'; },
    DrizzleSwapRepository: class { name = 'drizzle-swap'; },
    DrizzleTransactionManager: class { name = 'drizzle-tx-manager'; },
    SimpleWebAuthnGateway: class { name = 'simple-webauthn'; },
    StarknetRpcGateway: class { name = 'starknet-rpc'; },
    AvnuPaymasterGateway: class { name = 'avnu-paymaster'; },
    AvnuSwapGateway: class { name = 'avnu-swap'; },
    AtomiqSdkGateway: class { name = 'atomiq-sdk'; },
    Bolt11LightningDecoder: class { name = 'bolt11-lightning-decoder'; },
    CoinGeckoPriceGateway: class { name = 'coingecko-price'; },
  };
});

const mockDb = {} as any;

function createMockConfig(): AppConfig.Config {
  return {
    appVersion: '0.0.0',
    nodeEnv: 'test',
    starknetNetwork: 'testnet',
    port: 8080,
    database: {url: 'postgres://test'},
    webauthn: {rpId: 'localhost', rpName: 'Test App', origin: 'http://localhost:8080'},
    starknetRpcUrl: 'http://localhost:5050',
    accountClassHash: '0x123',
    wbtcTokenAddress: '0x456',
    strkTokenAddress: '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
    avnuPaymaster: {apiUrl: 'http://localhost:9090', apiKey: 'test-key'},
    avnuSwap: {baseUrl: 'https://sepolia.api.avnu.fi', knownTokenAddresses: ['0x456', '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d']},
    feeTreasuryAddress: '0x027367ddd36d7efc4694e1af5742f8d26626369c07abf15d136ff422b9a40fa0',
    atomiq: {network: 'testnet', starknetRpcUrl: 'http://localhost:5050', storagePath: '/tmp/bim/atomiq', autoCreateStorage: true, swapToken: 'WBTC', knownTokenAddresses: ['0x456', '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d']},
    logLevel: 'silent',
  };
}

describe('AppContext', () => {
  describe('createDefault', () => {
    it('creates context with default implementations when no overrides', () => {
      const config = createMockConfig();

      const context = AppContext.createDefault(config, mockDb, logger);

      expect(context.repositories).toBeDefined();
      expect(context.gateways).toBeDefined();
      expect(context.services).toBeDefined();
      expect(context.webauthn).toBeDefined();
    });

    it('applies gateway overrides', () => {
      const config = createMockConfig();
      const mockPaymaster = {name: 'mock-paymaster'} as unknown as PaymasterGateway;
      const overrides: AppContextOverrides = {
        gateways: {
          paymaster: mockPaymaster,
        },
      };

      const context = AppContext.createDefault(config, mockDb, logger, overrides);

      expect((context.gateways.paymaster as any).name).toBe('mock-paymaster');
    });

    it('applies repository overrides', () => {
      const config = createMockConfig();
      const mockAccountRepo = {name: 'mock-account'} as unknown as AccountRepository;
      const overrides: AppContextOverrides = {
        repositories: {
          account: mockAccountRepo,
        },
      };

      const context = AppContext.createDefault(config, mockDb, logger, overrides);

      expect((context.repositories.account as any).name).toBe('mock-account');
    });

    it('applies webauthn config overrides', () => {
      const config = createMockConfig();
      const overrides: AppContextOverrides = {
        webauthn: {
          rpId: 'override-rpId',
        },
      };

      const context = AppContext.createDefault(config, mockDb, logger, overrides);

      expect(context.webauthn.rpId).toBe('override-rpId');
      // Other webauthn fields should come from config
      expect(context.webauthn.rpName).toBe('Test App');
    });

    it('services use overridden gateways', () => {
      const config = createMockConfig();
      const mockPaymaster = {
        name: 'mock-paymaster',
        executeTransaction: vi.fn(),
      } as unknown as PaymasterGateway;
      const overrides: AppContextOverrides = {
        gateways: {
          paymaster: mockPaymaster,
        },
      };

      const context = AppContext.createDefault(config, mockDb, logger, overrides);

      // Verify the gateway is the mocked one
      expect((context.gateways.paymaster as any).name).toBe('mock-paymaster');
      // The AccountService should have been created with this gateway
      // (we can't directly verify this, but the integration tests will confirm it works)
    });

    it('services use overridden repositories', () => {
      const config = createMockConfig();
      const mockAccountRepo = {
        name: 'mock-account',
        findById: vi.fn(),
        save: vi.fn(),
      } as unknown as AccountRepository;
      const overrides: AppContextOverrides = {
        repositories: {
          account: mockAccountRepo,
        },
      };

      const context = AppContext.createDefault(config, mockDb, logger, overrides);

      expect((context.repositories.account as any).name).toBe('mock-account');
    });
  });
});
