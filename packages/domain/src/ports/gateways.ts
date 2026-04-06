import type {FiatCurrency} from '../currency';
import type {BitcoinAddress, StarknetAddress} from '../shared';
import type {LightningInvoice, SwapDirection, SwapId, SwapLimits} from '../swap';

/**
 * Gateway interface for Starknet blockchain interactions.
 */
export interface StarknetGateway {
  /** Calculates the deterministic account address from a public key. */
  calculateAccountAddress(params: {
    publicKey: string;
  }): StarknetAddress;

  /** Builds a deployment transaction for a new account. */
  buildDeployTransaction(params: {
    starknetAddress: StarknetAddress;
    publicKey: string;
  }): DeployTransaction;

  /** Waits for a transaction to be confirmed. */
  waitForTransaction(txHash: string): Promise<TransactionReceipt>;

  /** Checks whether a contract is deployed at the given address. */
  isDeployed(address: StarknetAddress): Promise<boolean>;

  /** Gets the current nonce for an account. */
  getNonce(address: StarknetAddress): Promise<bigint>;

  /** Gets the balance of a token for an address. */
  getBalance(params: {
    address: StarknetAddress;
    token: string;
  }): Promise<bigint>;

  /** Estimates the fee for a transaction. */
  estimateFee(transaction: StarknetTransaction): Promise<bigint>;

  /**
   * Builds a multicall transaction via the paymaster.
   * Returns OutsideExecution typed data and the message hash to use as WebAuthn challenge.
   */
  buildCalls(params: {
    senderAddress: StarknetAddress;
    calls: readonly StarknetCall[];
  }): Promise<{typedData: unknown; messageHash: string}>;

  /**
   * Executes a signed multicall transaction via the paymaster.
   * The signature must be in Argent compact_no_legacy format.
   */
  executeSignedCalls(params: {
    senderAddress: StarknetAddress;
    typedData: unknown;
    signature: string[];
  }): Promise<{txHash: string}>;
}

/**
 * Generic Starknet contract call.
 * Compatible with ERC-20 transfer calls and any other entrypoint.
 */
export interface StarknetCall {
  readonly contractAddress: string;
  readonly entrypoint: string;
  readonly calldata: readonly string[];
}

/** Deploy account transaction for Starknet. */
export interface DeployTransaction {
  type: 'DEPLOY_ACCOUNT';
  contractAddress: string;
  classHash: string;
  salt: string;
  constructorCallData: string[];
  signature: string[];
}

/** Generic Starknet invoke transaction. */
export interface StarknetTransaction {
  type: string;
  contractAddress: string;
  callData: string[];
  signature?: string[];
}

/** Receipt returned after a Starknet transaction is confirmed. */
export interface TransactionReceipt {
  transactionHash: string;
  status: 'ACCEPTED_ON_L2' | 'ACCEPTED_ON_L1' | 'REJECTED';
  blockNumber?: number;
  blockHash?: string;
}

/**
 * Gateway interface for AVNU Paymaster interactions (gasless transactions).
 */
export interface PaymasterGateway {
  /**
   * Executes deploy transaction via the paymaster (gasless).
   * Deploy transactions don't need client-side signing.
   */
  executeTransaction(params: {
    transaction: StarknetTransaction | DeployTransaction;
    accountAddress: StarknetAddress;
  }): Promise<PaymasterResult>;

  /**
   * Builds invoke transaction via SNIP-29 paymaster_buildTransaction.
   * Returns OutsideExecution typed data that must be signed by the user.
   */
  buildInvokeTransaction(params: {
    calls: readonly StarknetCall[];
    accountAddress: StarknetAddress;
  }): Promise<{typedData: unknown}>;

  /**
   * Executes signed invoke transaction via SNIP-29 paymaster_executeTransaction.
   * The signature must be in Argent compact_no_legacy format.
   */
  executeInvokeTransaction(params: {
    typedData: unknown;
    signature: string[];
    accountAddress: StarknetAddress;
  }): Promise<PaymasterResult>;

  /** Builds a transaction with paymaster sponsorship (legacy). */
  buildPaymasterTransaction(params: {
    transaction: StarknetTransaction;
    accountAddress: StarknetAddress;
  }): Promise<PaymasterTransaction>;

  /** Checks if paymaster is available for the given account. */
  isAvailable(accountAddress: StarknetAddress): Promise<boolean>;

  /** Gets the sponsored gas limit for the current period. */
  getSponsoredGasLimit(): Promise<bigint>;

  /**
   * Gets the remaining STRK sponsor credits associated with the configured
   * AVNU API key. Returns the balance in wei (18 decimals).
   *
   * This is the actual quantity that gets consumed when the paymaster
   * sponsors user transactions — not the on-chain balance of any account.
   */
  getRemainingCredits(): Promise<bigint>;
}

/** Result of a paymaster-sponsored transaction execution. */
export interface PaymasterResult {
  txHash: string;
  success: boolean;
}

/** A transaction enriched with paymaster sponsorship data. */
export interface PaymasterTransaction {
  /** The original transaction with paymaster-modified fields (resource bounds, etc.) */
  transaction: StarknetTransaction;
  /** Paymaster's signature authorizing gas sponsorship. */
  sponsorSignature: string;
  /** Token address used for gas payment; omit using the paymaster's default. */
  gasToken?: string;
}

/**
 * Gateway interface for Atomiq SDK interactions (cross-chain swaps).
 */
export interface AtomiqGateway {
  /** Pings the Atomiq intermediary and reports health to the registry. */
  checkHealth(): Promise<void>;

  /** Creates a Lightning -> Starknet swap. */
  createLightningToStarknetSwap(params: {
    amountSats: bigint;
    destinationAddress: StarknetAddress;
    description?: string;
  }): Promise<AtomiqSwapResult>;

  /**
   * Prepares a Bitcoin -> Starknet swap (phase 1).
   * Creates the swap quote and returns unsigned commit transactions
   * that must be signed and submitted before the Bitcoin address becomes available.
   */
  prepareBitcoinToStarknetSwap(params: {
    amountSats: bigint;
    destinationAddress: StarknetAddress;
  }): Promise<BitcoinSwapQuote>;

  /**
   * Completes a Bitcoin swap commit (phase 2).
   * Waits for the commit to be confirmed on-chain, then returns the Bitcoin deposit address.
   * Must be called after the commit transactions have been signed and submitted.
   */
  completeBitcoinSwapCommit(swapId: string): Promise<BitcoinSwapCommitResult>;

  /** Creates a Starknet -> Lightning swap. */
  createStarknetToLightningSwap(params: {
    invoice: LightningInvoice;
    sourceAddress: StarknetAddress;
  }): Promise<AtomiqReverseSwapResult>;

  /** Creates a Starknet -> Bitcoin swap. */
  createStarknetToBitcoinSwap(params: {
    amountSats: bigint;
    destinationAddress: BitcoinAddress;
    sourceAddress: StarknetAddress;
  }): Promise<AtomiqReverseSwapResult>;

  /** Gets limits for Lightning -> Starknet swaps. */
  getLightningToStarknetLimits(): Promise<SwapLimits>;

  /** Gets limits for Bitcoin -> Starknet swaps. */
  getBitcoinToStarknetLimits(): Promise<SwapLimits>;

  /** Gets limits for Starknet -> Lightning swaps. */
  getStarknetToLightningLimits(): Promise<SwapLimits>;

  /** Gets limits for Starknet -> Bitcoin swaps. */
  getStarknetToBitcoinLimits(): Promise<SwapLimits>;

  /**
   * Gets the current status of a swap from Atomiq.
   *
   * @param swapId - The swap ID returned by Atomiq at creation time.
   * @param direction - Swap direction, used to correctly interpret SDK state numbers.
   *   For bitcoin_to_starknet swaps, state 1 means "committed" (not "paid"),
   *   so isPaid requires state >= 2.
   */
  getSwapStatus(swapId: SwapId, direction?: SwapDirection): Promise<AtomiqSwapStatus>;

  /** Checks if a swap payment has been received. */
  isSwapPaid(swapId: SwapId): Promise<boolean>;

  /**
   * Claims a forward swap (Bitcoin/Lightning → Starknet) using a backend signer,
   * then refunds the claimer bounty (STRK) to the user's account.
   *
   * The claim tx sends WBTC to the user and the bounty to the backend.
   * The refund tx transfers the bounty from the backend back to the user.
   */
  claimForwardSwap(swapId: SwapId): Promise<ForwardSwapClaimResult>;
}

/** Result of claiming a forward swap and refunding the bounty. */
export interface ForwardSwapClaimResult {
  claimTxHash: string;
  refundTxHash: string | undefined;
  bountyAmount: bigint;
  userAddress: string;
}

/** Result of creating a forward swap (Lightning/Bitcoin -> Starknet). */
export interface AtomiqSwapResult {
  swapId: string;
  invoice?: string;
  depositAddress?: string;
  bip21Uri?: string;
  expiresAt: Date;
}

/** Result of creating a reverse swap (Starknet -> Lightning/Bitcoin). */
export interface AtomiqReverseSwapResult {
  swapId: string;
  commitCalls: StarknetCall[];
  amountSats: bigint;
  expiresAt: Date;
}

/** Current status of a swap as reported by Atomiq. */
export interface AtomiqSwapStatus {
  state: number;
  isPaid: boolean;
  isClaimable: boolean;
  isCompleted: boolean;
  isFailed: boolean;
  isExpired: boolean;
  isRefunded: boolean;
  txHash?: string;
  error?: string;
}

/** Quote returned when preparing a Bitcoin -> Starknet swap. */
export interface BitcoinSwapQuote {
  swapId: string;
  commitCalls: StarknetCall[];
  expiresAt: Date;
}

/** Result of completing the commit phase of a Bitcoin swap. */
export interface BitcoinSwapCommitResult {
  depositAddress: string;
  bip21Uri: string;
}

/**
 * Gateway for token swap operations (e.g., AVNU DEX aggregator).
 */
export interface SwapGateway {
  /**
   * Gets the calls needed to swap tokens.
   * Returns StarknetCalls (approve and swap) ready to be included in a multicall.
   *
   * @param params.sellToken - Address of the token to sell
   * @param params.buyToken - Address of the token to buy
   * @param params.buyAmount - Desired amount of buy token (exact output)
   * @param params.takerAddress - Account address performing the swap
   */
  getSwapCalls(params: {
    sellToken: string;
    buyToken: string;
    buyAmount: bigint;
    takerAddress: string;
  }): Promise<{
    calls: StarknetCall[];
    sellAmount: bigint;
    buyAmount: bigint;
  }>;
}

/**
 * Gateway interface for fetching cryptocurrency prices.
 */
export interface PriceGateway {
  /** Fetches BTC price in the given fiat currencies. Returns a map of currency -> price. */
  getBtcPrices(currencies: FiatCurrency[]): Promise<Map<FiatCurrency, number>>;
}

/**
 * Gateway interface for WebAuthn verification operations.
 */
export interface WebAuthnGateway {
  /** Verifies a WebAuthn registration response. */
  verifyRegistration(params: VerifyRegistrationParams): Promise<RegistrationVerificationResult>;

  /** Verifies a WebAuthn authentication response. */
  verifyAuthentication(params: VerifyAuthenticationParams): Promise<AuthenticationVerificationResult>;
}

/** Parameters for verifying a WebAuthn registration ceremony. */
export interface VerifyRegistrationParams {
  expectedChallenge: string;
  expectedOrigin: string;
  expectedRPID: string;
  credential: {
    id: string;
    rawId: string;
    response: {
      clientDataJSON: string;
      attestationObject: string;
    };
    type: 'public-key';
  };
}

/** Result of a successful WebAuthn registration verification. */
export interface RegistrationVerificationResult {
  verified: boolean;
  encodedCredentialId: Base64URLString;
  starknetPublicKeyX: string;
  encodedCredentialPublicKey: Base64URLString;
  signCount: number;
}

/** Parameters for verifying a WebAuthn authentication ceremony. */
export interface VerifyAuthenticationParams {
  expectedChallenge: string;
  expectedOrigin: string;
  expectedRPID: string;
  credential: {
    id: string;
    rawId: string;
    response: {
      clientDataJSON: string;
      authenticatorData: string;
      signature: string;
      userHandle?: string;
    };
    type: 'public-key';
  };
  storedCredential: {
    credentialId: Base64URLString;
    publicKey: string;
    credentialPublicKey: string | undefined;
    signCount: number;
  };
}

/** Result of successful WebAuthn authentication verification. */
export interface AuthenticationVerificationResult {
  verified: boolean;
  newSignCount: number;
}

export type NotificationSeverity = 'alert' | 'error' | 'info';

export interface NotificationLink {
  readonly label: string;
  readonly url: string;
}

/**
 * A notification message to be sent through an external channel (Slack, email, etc.).
 * The gateway implementation decides visual formatting (colors, icons, layout).
 */
export interface NotificationMessage {
  readonly channel: string;
  readonly severity: NotificationSeverity;
  readonly title: string;
  readonly description: string;
  readonly fields: ReadonlyMap<string, string>;
  readonly links?: readonly NotificationLink[];
  readonly context?: string;
}

/**
 * Gateway interface for sending operational notifications.
 */
export interface NotificationGateway {
  send(message: NotificationMessage): Promise<void>;
}
