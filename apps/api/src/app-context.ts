import type {Database} from "@bim/db/database";
import {
  AccountDeployer,
  AccountReader,
  type DeployAccountUseCase,
  type GetBalanceUseCase,
  type GetDeploymentStatusUseCase
} from "@bim/domain/account";
import {
  Authenticator,
  type BeginLoginUseCase,
  type BeginRegistrationUseCase,
  ChallengeConsumer,
  type CompleteLoginUseCase,
  type CompleteRegistrationUseCase,
  type InvalidateSessionUseCase,
  Registrar,
  type SessionConfig,
  SessionInvalidator,
  SessionValidator,
  type ValidateSessionUseCase
} from "@bim/domain/auth";
import {BtcPriceReader, type GetPricesUseCase} from "@bim/domain/currency";
import {type ComponentName, HealthRegistry, type HealthTransitionEvent} from "@bim/domain/health";
import {ServiceHealthChange} from "@bim/domain/notifications";
import {
  BitcoinReceiver,
  type BuildDonationUseCase,
  type BuildPaymentUseCase,
  type CommitReceiveUseCase,
  DonationBuilder,
  Erc20CallFactory,
  type ExecutePaymentUseCase,
  FeeConfig,
  PaymentBuildCache,
  PaymentBuilder,
  PaymentExecutor,
  PaymentParser,
  PaymentPreparator,
  PaymentReceiver,
  type PreparePaymentUseCase,
  ReceiveBuildCache,
  type ReceivePaymentUseCase,
} from "@bim/domain/payment";
import type {
  AccountRepository,
  AtomiqGateway,
  ChallengeRepository,
  LightningDecoder,
  NotificationGateway,
  PaymasterGateway,
  PriceGateway,
  SessionRepository,
  SignatureProcessor,
  StarknetGateway,
  SwapGateway,
  SwapRepository,
  TransactionRepository,
  UserSettingsRepository,
  WebAuthnGateway,
} from "@bim/domain/ports";
import type {StarknetConfig} from "@bim/domain/shared";
import {
  type FetchSwapLimitsUseCase,
  type FetchSwapStatusUseCase,
  SwapCoordinator,
  SwapReader,
} from "@bim/domain/swap";
import {
  type FetchSettingsUseCase,
  type FetchTransactionsUseCase,
  TransactionService,
  type UpdateSettingsUseCase,
  UserSettingsService
} from "@bim/domain/user";
import {serializeError} from '@bim/lib/error';
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
  WebAuthnSignatureProcessor,
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
    signatureProcessor: SignatureProcessor;
  };
  healthRegistry: HealthRegistry;
  services: {
    swapCoordinator: SwapCoordinator;
    userSettings: UserSettingsService;
    transaction: TransactionService;
  };
  useCases: {
    // Account
    accountDeployer: DeployAccountUseCase;
    accountReader: GetBalanceUseCase & GetDeploymentStatusUseCase;
    // Auth
    registrar: BeginRegistrationUseCase & CompleteRegistrationUseCase;
    authenticator: BeginLoginUseCase & CompleteLoginUseCase;
    sessionValidator: ValidateSessionUseCase;
    sessionInvalidator: InvalidateSessionUseCase;
    // User
    fetchSettings: FetchSettingsUseCase;
    updateSettings: UpdateSettingsUseCase;
    fetchTransactions: FetchTransactionsUseCase;
    // Currency
    btcPriceReader: GetPricesUseCase;
    // Swap
    swapReader: FetchSwapLimitsUseCase & FetchSwapStatusUseCase;
    // Payment
    paymentPreparator: PreparePaymentUseCase;
    paymentBuilder: BuildPaymentUseCase;
    donationBuilder: BuildDonationUseCase;
    paymentExecutor: ExecutePaymentUseCase;
    paymentReceiver: ReceivePaymentUseCase & CommitReceiveUseCase;
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
            {component: event.component, cause: serializeError(err)},
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
      signatureProcessor: new WebAuthnSignatureProcessor({
        origin: config.webauthn.origin,
        rpId: config.webauthn.rpId,
      }, rootLogger),
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
    const accountDeployer = new AccountDeployer({
      accountRepository: repositories.account,
      starknetGateway: gateways.starknet,
      paymasterGateway: gateways.paymaster,
      logger: rootLogger,
    });
    const accountReader = new AccountReader({
      accountRepository: repositories.account,
      starknetGateway: gateways.starknet,
      logger: rootLogger,
    });

    // Internal domain service: shared challenge consumption logic
    const challengeConsumer = new ChallengeConsumer({
      challengeRepository: repositories.challenge,
    });

    const transactionManager = new DrizzleTransactionManager(db);

    const registrar = new Registrar({
      accountRepository: repositories.account,
      sessionRepository: repositories.session,
      challengeRepository: repositories.challenge,
      transactionManager,
      webAuthnGateway: gateways.webAuthn,
      challengeConsumer,
      sessionConfig: config.session,
      webAuthnConfig: webauthn,
      logger: rootLogger,
    });
    const authenticator = new Authenticator({
      accountRepository: repositories.account,
      sessionRepository: repositories.session,
      challengeRepository: repositories.challenge,
      transactionManager,
      webAuthnGateway: gateways.webAuthn,
      challengeConsumer,
      sessionConfig: config.session,
      webAuthnConfig: webauthn,
      logger: rootLogger,
    });
    const sessionValidator = new SessionValidator({
      sessionRepository: repositories.session,
      accountRepository: repositories.account,
      sessionConfig: config.session,
      logger: rootLogger,
    });
    const sessionInvalidator = new SessionInvalidator({
      sessionRepository: repositories.session,
    });

    const swapReader = new SwapReader({
      swapRepository: repositories.swap,
      atomiqGateway: gateways.atomiq,
      transactionRepository: repositories.transaction,
      logger: rootLogger,
    });

    const swapCoordinator = new SwapCoordinator({
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

    const paymentParser = new PaymentParser({
      lightningDecoder: gateways.lightningDecoder,
      starknetConfig,
      logger: rootLogger,
    });

    const paymentPreparator = new PaymentPreparator({
      paymentParser,
      swapReader,
      feeConfig,
      logger: rootLogger,
    });

    const btcPriceReader = new BtcPriceReader({
      priceGateway: gateways.price,
      logger: rootLogger,
    });

    const paymentBuildCache = new PaymentBuildCache();
    const receiveBuildCache = new ReceiveBuildCache();

    const bitcoinReceiver = new BitcoinReceiver({
      swapCoordinator,
      starknetGateway: gateways.starknet,
      dexGateway: gateways.dex,
      signatureProcessor: gateways.signatureProcessor,
      receiveBuildCache,
      transactionRepository: repositories.transaction,
      notificationGateway: gateways.notification,
      starknetConfig,
      logger: rootLogger,
    });

    const paymentReceiver = new PaymentReceiver({
      swapCoordinator,
      bitcoinReceiver,
      starknetConfig,
      logger: rootLogger,
    });

    const paymentBuilder = new PaymentBuilder({
      paymentParser,
      paymentPreparator,
      erc20CallFactory,
      swapCoordinator,
      starknetGateway: gateways.starknet,
      paymentBuildCache,
      starknetConfig,
      logger: rootLogger,
    });

    const donationBuilder = new DonationBuilder({
      starknetGateway: gateways.starknet,
      paymentBuildCache,
      starknetConfig,
      logger: rootLogger,
    });

    const paymentExecutor = new PaymentExecutor({
      paymentBuildCache,
      signatureProcessor: gateways.signatureProcessor,
      starknetGateway: gateways.starknet,
      accountRepository: repositories.account,
      transactionRepository: repositories.transaction,
      notificationGateway: gateways.notification,
      starknetConfig,
      logger: rootLogger,
    });

    const useCases: AppContext['useCases'] = {
      // Account
      accountDeployer,
      accountReader,
      // Auth
      registrar,
      authenticator,
      sessionValidator,
      sessionInvalidator,
      // User
      fetchSettings: userSettingsService,
      updateSettings: userSettingsService,
      fetchTransactions: transactionService,
      // Currency
      btcPriceReader,
      // Swap
      swapReader,
      // Payment
      paymentPreparator,
      paymentBuilder,
      donationBuilder,
      paymentExecutor,
      paymentReceiver,
    };

    return {
      repositories,
      gateways,
      useCases,
      paymentBuildCache,
      services: {
        swapCoordinator,
        userSettings: userSettingsService,
        transaction: transactionService,
      },
      sessionConfig: config.session,
      starknetConfig,
      webauthn,
      healthRegistry,
      logger: rootLogger,
    };
  }

}
