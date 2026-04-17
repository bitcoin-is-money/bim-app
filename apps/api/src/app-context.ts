import type {Database} from "@bim/db/database";
import {AccountService} from "@bim/domain/account";
import {AuthService, type SessionConfig, SessionService} from "@bim/domain/auth";
import {CurrencyService} from "@bim/domain/currency";
import {type ComponentName, HealthRegistry, type HealthTransitionEvent} from "@bim/domain/health";
import {ServiceHealthChange} from "@bim/domain/notifications";
import {Erc20CallFactory, FeeConfig, ParseService, PaymentBuildCache, PayService, ReceiveService} from "@bim/domain/payment";
import type {
  AccountRepository,
  AtomiqGateway,
  ChallengeRepository,
  LightningDecoder,
  NotificationGateway,
  PaymasterGateway,
  PriceGateway,
  SessionRepository,
  StarknetGateway,
  SwapGateway,
  SwapRepository,
  TransactionRepository,
  UserSettingsRepository,
  WebAuthnGateway,
} from "@bim/domain/ports";
import type {StarknetConfig} from "@bim/domain/shared";
import {SwapService,} from "@bim/domain/swap";
import {TransactionService, UserSettingsService} from "@bim/domain/user";
import type pg from 'pg';
import type {Logger} from "pino";
import {
  AtomiqSdkGateway,
  AvnuPaymasterGateway,
  AvnuSwapGateway,
  Bolt11LightningDecoder,
  CoinGeckoPriceGateway,
  DrizzleAccountRepository,
  DrizzleChallengeRepository,
  DrizzleSessionRepository,
  DrizzleSwapRepository,
  DrizzleTransactionManager,
  DrizzleTransactionRepository,
  DrizzleUserSettingsRepository,
  NoopNotificationGateway,
  SimpleWebAuthnGateway,
  SlackNotificationGateway,
  StarknetRpcGateway,
} from "./adapters";
import type {AppConfig} from "./app-config";

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
    dex: SwapGateway;
    lightningDecoder: LightningDecoder;
    price: PriceGateway;
    notification: NotificationGateway;
  };
  healthRegistry: HealthRegistry;
  services: {
    account: AccountService;
    auth: AuthService;
    session: SessionService;
    swap: SwapService;
    userSettings: UserSettingsService;
    transaction: TransactionService;
    parseService: ParseService;
    payService: PayService;
    receive: ReceiveService;
    currency: CurrencyService;
  };
  paymentBuildCache: PaymentBuildCache;
  sessionConfig: SessionConfig;
  starknetConfig: StarknetConfig;
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
    pool: pg.Pool,
    rootLogger: Logger,
    overrides?: AppContextOverrides,
  ): AppContext {
    const log = rootLogger.child({name: 'app-context.ts'});

    // Initialize repositories (with optional overrides)
    const repositories: AppContext['repositories'] = {
      account: new DrizzleAccountRepository(db),
      session: new DrizzleSessionRepository(db),
      challenge: new DrizzleChallengeRepository(db),
      swap: new DrizzleSwapRepository(db),
      userSettings: new DrizzleUserSettingsRepository(db),
      transaction: new DrizzleTransactionRepository(db),
      ...overrides?.repositories,
    };

    // Notification gateway: Slack when a bot token is configured, otherwise a
    // no-op that just logs. Available app-wide via context.gateways.notification.
    const notificationGateway: NotificationGateway = config.alerting.slack
      ? new SlackNotificationGateway(config.alerting.slack, rootLogger)
      : new NoopNotificationGateway(rootLogger);

    // Health registry: tracks the health of critical services. On any
    // transition, forwards a structured event to Slack via ServiceHealthChange.
    const trackedComponents: readonly ComponentName[] = [
      'database',
      'starknet-rpc',
      'avnu-paymaster',
      'atomiq',
      'avnu-swap',
      'coingecko-price',
    ];

    const healthRegistry = new HealthRegistry(
      trackedComponents,
      (event: HealthTransitionEvent) => {
        const message = ServiceHealthChange.fromEvent(event);
        notificationGateway.send(message).catch((err: unknown) => {
          log.warn(
            {component: event.component, cause: err instanceof Error ? err.message : String(err)},
            'Failed to send health change notification',
          );
        });
      },
      rootLogger,
    );

    // Initialize paymaster first (needed by starknet gateway for executeCalls)
    const paymasterGateway = new AvnuPaymasterGateway(config.avnuPaymaster, rootLogger, healthRegistry);

    // Initialize gateways (with optional overrides)
    const gateways: AppContext['gateways'] = {
      webAuthn: new SimpleWebAuthnGateway(config.webauthn, rootLogger),
      starknet: new StarknetRpcGateway(
        {
          rpcUrl: config.starknet.rpcUrl,
          accountClassHash: config.starknet.accountClassHash,
          tokenAddresses: {
            WBTC: config.starknet.wbtcTokenAddress,
            STRK: config.starknet.strkTokenAddress,
          },
          webauthnOrigin: config.webauthn.origin,
          webauthnRpId: config.webauthn.rpId,
        },
        paymasterGateway,
        rootLogger,
        healthRegistry,
      ),
      paymaster: paymasterGateway,
      atomiq: new AtomiqSdkGateway({...config.atomiq, pool}, rootLogger, healthRegistry),
      dex: new AvnuSwapGateway(config.avnuSwap, rootLogger, healthRegistry),
      lightningDecoder: new Bolt11LightningDecoder(),
      price: new CoinGeckoPriceGateway(rootLogger, healthRegistry),
      notification: notificationGateway,
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
        transactionManager: new DrizzleTransactionManager(db),
        webAuthnGateway: gateways.webAuthn,
        sessionConfig: config.session,
        logger: rootLogger,
      },
      webauthn,
    );

    const sessionService = new SessionService({
      sessionRepository: repositories.session,
      accountRepository: repositories.account,
      sessionConfig: config.session,
      logger: rootLogger,
    });

    const swapService = new SwapService({
      swapRepository: repositories.swap,
      atomiqGateway: gateways.atomiq,
      transactionRepository: repositories.transaction,
      bitcoinNetwork: config.starknet.bitcoinNetwork,
      logger: rootLogger,
    });

    const userSettingsService = new UserSettingsService({
      userSettingsRepository: repositories.userSettings,
    });

    const transactionService = new TransactionService({
      transactionRepository: repositories.transaction,
    });

    const {starknet: starknetConfig} = config;

    const feeConfig = FeeConfig.create({
      percentages: FeeConfig.DEFAULT_PERCENTAGES,
      recipientAddress: starknetConfig.feeTreasuryAddress,
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

    const currencyService = new CurrencyService({
      priceGateway: gateways.price,
      logger: rootLogger,
    });

    const paymentBuildCache = new PaymentBuildCache();

    return {
      repositories,
      gateways,
      paymentBuildCache,
      services: {
        account: accountService,
        auth: authService,
        session: sessionService,
        swap: swapService,
        userSettings: userSettingsService,
        transaction: transactionService,
        parseService: parseService,
        payService: payService,
        receive: receiveService,
        currency: currencyService,
      },
      sessionConfig: config.session,
      starknetConfig,
      webauthn,
      healthRegistry,
      logger: rootLogger,
    };
  }

}
