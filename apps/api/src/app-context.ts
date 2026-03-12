import {AccountService, StarknetAddress} from "@bim/domain/account";
import {AuthService, SessionService} from "@bim/domain/auth";
import {Erc20CallFactory, FeeConfig, ParseService, PayService, ReceiveService,} from "@bim/domain/payment";
import {CurrencyService} from "@bim/domain/currency";
import type {
  AccountRepository,
  AtomiqGateway,
  ChallengeRepository,
  SwapGateway,
  LightningDecoder,
  PaymasterGateway,
  PriceGateway,
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
  AvnuSwapGateway,
  Bolt11LightningDecoder,
  CoinGeckoPriceGateway,
  DrizzleAccountRepository,
  DrizzleChallengeRepository,
  DrizzleSessionRepository,
  DrizzleTransactionRepository,
  DrizzleUserSettingsRepository,
  DrizzleSwapRepository,
  DrizzleTransactionManager,
  SimpleWebAuthnGateway,
  StarknetRpcGateway
} from "./adapters";
import {Database} from "@bim/db/database";
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
  };
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
    rootLogger: Logger,
    overrides?: AppContextOverrides,
  ): AppContext {

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

    // Initialize paymaster first (needed by starknet gateway for executeCalls)
    const paymasterGateway = new AvnuPaymasterGateway(config.avnuPaymaster, rootLogger);

    // Initialize gateways (with optional overrides)
    const gateways: AppContext['gateways'] = {
      webAuthn: new SimpleWebAuthnGateway(config.webauthn, rootLogger),
      starknet: new StarknetRpcGateway(
        {
          rpcUrl: config.starknetRpcUrl,
          accountClassHash: config.accountClassHash,
          tokenAddresses: {
            WBTC: config.wbtcTokenAddress,
            STRK: config.strkTokenAddress,
          },
          webauthnOrigin: config.webauthn.origin,
          webauthnRpId: config.webauthn.rpId,
        },
        paymasterGateway,
        rootLogger,
      ),
      paymaster: paymasterGateway,
      atomiq: new AtomiqSdkGateway(config.atomiq, rootLogger),
      dex: new AvnuSwapGateway(config.avnuSwap, rootLogger),
      lightningDecoder: new Bolt11LightningDecoder(),
      price: new CoinGeckoPriceGateway(rootLogger),
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
      wbtcTokenAddress: StarknetAddress.of(config.wbtcTokenAddress),
      strkTokenAddress: StarknetAddress.of(config.strkTokenAddress),
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

    const currencyService = new CurrencyService({
      priceGateway: gateways.price,
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
        parseService: parseService,
        payService: payService,
        receive: receiveService,
        currency: currencyService,
      },
      starknetConfig,
      webauthn,
      logger: rootLogger,
    };
  }

}
