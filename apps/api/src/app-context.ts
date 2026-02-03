import {AccountService, StarknetAddress} from "@bim/domain/account";
import {AuthService, SessionService} from "@bim/domain/auth";
import {
  Erc20CallFactory,
  FeeConfig,
  ParseService,
  PayService,
  ReceiveService,
} from "@bim/domain/payment";
import type {StarknetConfig} from "@bim/domain/shared";
import type {
  AccountRepository,
  AtomiqGateway,
  ChallengeRepository,
  LightningDecoder,
  PaymasterGateway,
  SessionRepository,
  StarknetGateway,
  SwapRepository,
  TransactionRepository,
  UserSettingsRepository,
  WatchedAddressRepository,
  WebAuthnGateway,
} from "@bim/domain/ports";
import {SwapService,} from "@bim/domain/swap";
import {TransactionService, UserSettingsService} from "@bim/domain/user";
import {
  AtomiqSdkGateway,
  AvnuPaymasterGateway,
  Bolt11LightningDecoder,
  DrizzleAccountRepository,
  DrizzleChallengeRepository,
  DrizzleSessionRepository,
  DrizzleTransactionRepository,
  DrizzleUserSettingsRepository,
  DrizzleWatchedAddressRepository,
  InMemorySwapRepository,
  SimpleWebAuthnGateway,
  StarknetRpcGateway
} from "./adapters";
import {type Database} from "./db";
import {type AppConfig} from "./types";

/**
 * Application context containing repositories, gateways, services, and configuration.
 */
export interface AppContext {
  repositories: {
    account: AccountRepository;
    session: SessionRepository;
    challenge: ChallengeRepository;
    swap: SwapRepository;
    userSettings: UserSettingsRepository;
    watchedAddress: WatchedAddressRepository;
    transaction: TransactionRepository;
  };
  gateways: {
    webAuthn: WebAuthnGateway;
    starknet: StarknetGateway;
    paymaster: PaymasterGateway;
    atomiq: AtomiqGateway;
    lightningDecoder: LightningDecoder;
  };
  services: {
    account: AccountService;
    auth: AuthService;
    session: SessionService;
    swap: SwapService;
    userSettings: UserSettingsService;
    transaction: TransactionService;
    pay: PayService;
    receive: ReceiveService;
  };
  webauthn: {
    rpId: string;
    rpName: string;
    origin: string;
  };
}

/**
 * Overrides that can be passed to createDefault to customize the context.
 * Used primarily for testing with mock/devnet implementations.
 */
export interface AppContextOverrides {
  repositories?: Partial<AppContext['repositories']>;
  gateways?: Partial<AppContext['gateways']>;
  webauthn?: Partial<AppContext['webauthn']>;
}

export namespace AppContext {

  /**
   * Creates the AppContext with all implementations.
   * Accepts optional overrides for repositories, gateways, and webauthn config.
   * Services are created AFTER applying overrides, so they use the correct dependencies.
   */
  export function createDefault(
    config: AppConfig,
    db: Database,
    overrides?: AppContextOverrides,
  ): AppContext {
    // Initialize repositories (with optional overrides)
    const repositories: AppContext['repositories'] = {
      account: new DrizzleAccountRepository(db),
      session: new DrizzleSessionRepository(db),
      challenge: new DrizzleChallengeRepository(db),
      swap: new InMemorySwapRepository(),
      userSettings: new DrizzleUserSettingsRepository(db),
      watchedAddress: new DrizzleWatchedAddressRepository(db),
      transaction: new DrizzleTransactionRepository(db),
      ...overrides?.repositories,
    };

    // Initialize paymaster first (needed by starknet gateway for executeCalls)
    const paymasterGateway = new AvnuPaymasterGateway({
      apiUrl: config.avnuApiUrl,
      apiKey: config.avnuApiKey,
    });

    // Initialize gateways (with optional overrides)
    const gateways: AppContext['gateways'] = {
      webAuthn: new SimpleWebAuthnGateway(),
      starknet: new StarknetRpcGateway(
        {
          rpcUrl: config.starknetRpcUrl,
          accountClassHash: config.accountClassHash,
          tokenAddresses: {WBTC: config.wbtcTokenAddress},
        },
        paymasterGateway,
      ),
      paymaster: paymasterGateway,
      atomiq: new AtomiqSdkGateway({
        network: config.nodeEnv === 'production' ? 'mainnet' : 'testnet',
        starknetRpcUrl: config.starknetRpcUrl,
      }),
      lightningDecoder: new Bolt11LightningDecoder(),
      ...overrides?.gateways,
    };

    // WebAuthn configuration (with optional overrides)
    const webauthn: AppContext['webauthn'] = {
      rpId: config.webauthnRpId,
      rpName: config.webauthnRpName,
      origin: config.webauthnOrigin,
      ...overrides?.webauthn,
    };

    // Initialize services AFTER applying overrides
    // This ensures services use the correct (possibly overridden) dependencies
    const accountService = new AccountService({
      accountRepository: repositories.account,
      starknetGateway: gateways.starknet,
      paymasterGateway: gateways.paymaster,
    });

    const authService = new AuthService({
        accountRepository: repositories.account,
        challengeRepository: repositories.challenge,
        sessionRepository: repositories.session,
        webAuthnGateway: gateways.webAuthn,
      },
      webauthn,
    );

    const sessionService = new SessionService({
      sessionRepository: repositories.session,
      accountRepository: repositories.account,
    });

    const swapService = new SwapService({
      swapRepository: repositories.swap,
      atomiqGateway: gateways.atomiq,
    });

    const userSettingsService = new UserSettingsService({
      userSettingsRepository: repositories.userSettings,
    });

    const transactionService = new TransactionService({
      transactionRepository: repositories.transaction,
      watchedAddressRepository: repositories.watchedAddress,
    });

    const starknetConfig: StarknetConfig = {
      wbtcTokenAddress: config.wbtcTokenAddress,
    };

    const feeConfig = FeeConfig.create({
      percentage: FeeConfig.DEFAULT_PERCENTAGE,
      recipientAddress: StarknetAddress.of(config.feeTreasuryAddress),
    });

    const erc20CallFactory = new Erc20CallFactory(feeConfig);

    const parseService = new ParseService({
      lightningDecoder: gateways.lightningDecoder,
      starknetConfig,
    });

    const payService = new PayService({
      parseService,
      erc20CallFactory,
      starknetGateway: gateways.starknet,
      swapService,
      starknetConfig,
      feeConfig,
    });

    const receiveService = new ReceiveService({
      swapService,
      starknetConfig,
    });

    return {
      repositories,
      gateways,
      services: {
        account: accountService,
        auth: authService,
        session: sessionService,
        swap: swapService,
        userSettings: userSettingsService,
        transaction: transactionService,
        pay: payService,
        receive: receiveService,
      },
      webauthn,
    };
  }

}
