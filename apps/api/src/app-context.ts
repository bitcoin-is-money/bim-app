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
  WebAuthnGateway
} from "@bim/domain";
import type {DeepPartial} from "@bim/lib/types/DeepPartial";
import deepmerge from "deepmerge";
import {
  AtomiqSdkGateway,
  AvnuPaymasterGateway,
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
 * Application context containing repositories, gateways, and configuration.
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
  };
  webauthn: {
    rpId: string;
    rpName: string;
    origin: string;
  };
}

export namespace AppContext {

  /**
   * Merge AppContext overrides into the base context.
   *
   * Only merge plain objects, replace class instances (gateways, repositories)
   * to avoid infinite loops from circular references (e.g., RpcProvider)
   *
   * @param base
   * @param override
   */
  export function mergeContext(
    base: AppContext,
    override: DeepPartial<AppContext> | undefined
  ): AppContext {
    return override
      ? deepmerge(base, override as Partial<AppContext>, { isMergeableObject: isPlainObject })
      : base;
  }

  /**
   * Creates the default AppContext with all production implementations.
   */
  export function createDefault(
    config: AppConfig,
    db: Database
  ): AppContext {
    return {
      repositories: {
        account: new DrizzleAccountRepository(db),
        session: new DrizzleSessionRepository(db),
        challenge: new DrizzleChallengeRepository(db),
        swap: new InMemorySwapRepository(),
        userSettings: new DrizzleUserSettingsRepository(db),
        watchedAddress: new DrizzleWatchedAddressRepository(db),
        transaction: new DrizzleTransactionRepository(db),
      },
      gateways: {
        webAuthn: new SimpleWebAuthnGateway(),
        starknet: new StarknetRpcGateway({
          rpcUrl: config.starknetRpcUrl,
          accountClassHash: config.accountClassHash,
        }),
        paymaster: new AvnuPaymasterGateway({
          apiUrl: config.avnuApiUrl,
          apiKey: config.avnuApiKey,
        }),
        atomiq: new AtomiqSdkGateway({
          network: config.nodeEnv === 'production' ? 'mainnet' : 'testnet',
          starknetRpcUrl: config.starknetRpcUrl,
        }),
      },
      webauthn: {
        rpId: config.webauthnRpId,
        rpName: config.webauthnRpName,
        origin: config.webauthnOrigin,
      },
    };
  }

  /**
   * Checks if a value is a plain object (not a class instance).
   * Used by deepmerge to avoid recursively merging class instances
   * that may have circular references (like RpcProvider from starknet.js).
   */
  function isPlainObject(value: unknown): boolean {
    if (!value || typeof value !== 'object') {
      return false;
    }
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }

}
