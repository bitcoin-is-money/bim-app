import {AccountService, StarknetAddress} from "@bim/domain/account";
import {AuthService, SessionService} from "@bim/domain/auth";
import {Erc20CallFactory, FeeConfig, ParseService, PayService, ReceiveService,} from "@bim/domain/payment";
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
  WebAuthnGateway,
} from "@bim/domain/ports";
import type {StarknetConfig} from "@bim/domain/shared";
import {SwapService,} from "@bim/domain/swap";
import {TransactionService, UserSettingsService} from "@bim/domain/user";
import type {Logger} from "pino";
import {
  AtomiqSdkGateway,
  AvnuPaymasterGateway,
  Bolt11LightningDecoder,
  DrizzleAccountRepository,
  DrizzleChallengeRepository,
  DrizzleSessionRepository,
  DrizzleTransactionRepository,
  DrizzleUserSettingsRepository,
  InMemorySwapRepository,
  SimpleWebAuthnGateway,
  StarknetRpcGateway
} from "./adapters";
import {type Database} from "./db";
import {type AppConfig} from "./app-config";

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
  logger: Logger;
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
    config: AppConfig.Config,
    db: Database,
    rootLogger: Logger,
    overrides?: AppContextOverrides,
  ): AppContext {

    // Initialize repositories (with optional overrides)
    const repositories: AppContext['repositories'] = {
      account: new DrizzleAccountRepository(db),
      session: new DrizzleSessionRepository(db),
      challenge: new DrizzleChallengeRepository(db),
      swap: new InMemorySwapRepository(),
      userSettings: new DrizzleUserSettingsRepository(db),
      transaction: new DrizzleTransactionRepository(db),
      ...overrides?.repositories,
    };

    // Initialize paymaster first (needed by starknet gateway for executeCalls)
    const paymasterGateway = new AvnuPaymasterGateway(
      {
        apiUrl: config.avnuApiUrl,
        apiKey: config.avnuApiKey,
      },
      rootLogger,
    );

    // Initialize gateways (with optional overrides)
    const gateways: AppContext['gateways'] = {
      webAuthn: new SimpleWebAuthnGateway(config.webauthn, rootLogger),
      starknet: new StarknetRpcGateway(
        {
          rpcUrl: config.starknetRpcUrl,
          accountClassHash: config.accountClassHash,
          tokenAddresses: {WBTC: config.wbtcTokenAddress},
          webauthnOrigin: config.webauthn.origin,
          webauthnRpId: config.webauthn.rpId,
        },
        paymasterGateway,
        rootLogger,
      ),
      paymaster: paymasterGateway,
      atomiq: new AtomiqSdkGateway(
        {
          network: config.starknetNetwork === 'mainnet' ? 'mainnet' : 'testnet',
          starknetRpcUrl: config.starknetRpcUrl,
          storagePath: config.atomiqStoragePath,
          autoCreateStorage: config.nodeEnv !== 'production',
        },
        rootLogger,
      ),
      lightningDecoder: new Bolt11LightningDecoder(),
      ...overrides?.gateways,
    };

    // WebAuthn configuration (with optional overrides)
    const webauthn: AppContext['webauthn'] = {
      rpId: config.webauthn.rpId,
      rpName: config.webauthn.rpName,
      origin: config.webauthn.origin,
      ...overrides?.webauthn,
    };

    // Initialize services AFTER applying overrides
    // This ensures services use the correct (possibly overridden) dependencies
    const accountService = new AccountService({
      accountRepository: repositories.account,
      starknetGateway: gateways.starknet,
      paymasterGateway: gateways.paymaster,
      logger: rootLogger,
    });

    const authService = new AuthService({
        accountRepository: repositories.account,
        challengeRepository: repositories.challenge,
        sessionRepository: repositories.session,
        webAuthnGateway: gateways.webAuthn,
        logger: rootLogger,
      },
      webauthn,
    );

    const sessionService = new SessionService({
      sessionRepository: repositories.session,
      accountRepository: repositories.account,
      logger: rootLogger,
    });

    const swapService = new SwapService({
      swapRepository: repositories.swap,
      atomiqGateway: gateways.atomiq,
      transactionRepository: repositories.transaction,
      logger: rootLogger,
    });

    const userSettingsService = new UserSettingsService({
      userSettingsRepository: repositories.userSettings,
    });

    const transactionService = new TransactionService({
      transactionRepository: repositories.transaction,
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
      logger: rootLogger,
    });

    const payService = new PayService({
      parseService,
      erc20CallFactory,
      starknetGateway: gateways.starknet,
      swapService,
      transactionRepository: repositories.transaction,
      starknetConfig,
      feeConfig,
      logger: rootLogger,
    });

    const receiveService = new ReceiveService({
      swapService,
      starknetConfig,
      logger: rootLogger,
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
      logger: rootLogger,
    };
  }

}
