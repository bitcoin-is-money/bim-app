import {StarknetAddress} from '@bim/domain/account';
import {HealthRegistry} from '@bim/domain/health';
import type {PaymasterGateway} from '@bim/domain/ports';
import {type StarknetGatewayConfig, StarknetRpcGateway} from '@bim/starknet';
import type {Logger} from 'pino';
import {CallData, hash} from 'starknet';

/**
 * Devnet-specific Starknet gateway that overrides address calculation.
 *
 * On devnet, accounts are deployed using the OpenZeppelin account class with a
 * STARK key (EdDSA), not the Argent WebAuthn class with a P256 key. This means
 * the address computed from the P256 public key doesn't match where the contract
 * is actually deployed.
 *
 * This gateway overrides `calculateAccountAddress` to compute the STARK-based
 * address that matches the DevnetPaymasterGateway deployment. This ensures:
 * 1. The account entity stores the correct (STARK-based) address
 * 2. Post-deployment verification finds the contract at the expected address
 */
export class DevnetStarknetGateway extends StarknetRpcGateway {
  private starkPublicKey: string | undefined;
  private readonly classHash: string;

  constructor(
    config: StarknetGatewayConfig,
    paymasterGateway: PaymasterGateway,
    logger: Logger,
  ) {
    // Devnet tests don't exercise the health registry; provide a standalone
    // instance with all tracked components and a no-op listener.
    const noopHealthRegistry = new HealthRegistry(
      ['database', 'starknet-rpc', 'avnu-paymaster', 'atomiq', 'avnu-swap', 'coingecko-price'],
      () => {},
      logger,
    );
    super(config, paymasterGateway, logger, noopHealthRegistry);
    this.classHash = config.accountClassHash;
  }

  /**
   * Sets the STARK public key used for address calculation.
   * Must be called after StarkSigner initialization.
   */
  setStarkPublicKey(publicKey: string): void {
    this.starkPublicKey = publicKey;
  }

  override calculateAccountAddress(params: {publicKey: string}): StarknetAddress {
    if (!this.starkPublicKey) {
      return super.calculateAccountAddress(params);
    }

    const compiledCalldata = CallData.compile([this.starkPublicKey]);
    const address = hash.calculateContractAddressFromHash(
      this.starkPublicKey,
      this.classHash,
      compiledCalldata,
      0,
    );
    return StarknetAddress.of(address);
  }
}
