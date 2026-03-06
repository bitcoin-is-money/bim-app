import type {StarknetAddress} from '../account';
import type {BitcoinAddress, LightningInvoice, SwapId} from '../swap';
import type {SwapDirection, SwapLimits} from '../swap';
import type {StarknetCall} from './starknet.gateway';

/**
 * Gateway interface for Atomiq SDK interactions (cross-chain swaps).
 */
export interface AtomiqGateway {
  // ===========================================================================
  // Swap Creation
  // ===========================================================================

  /**
   * Creates a Lightning → Starknet swap.
   */
  createLightningToStarknetSwap(params: {
    amountSats: bigint;
    destinationAddress: StarknetAddress;
    description?: string;
  }): Promise<AtomiqSwapResult>;

  /**
   * Prepares a Bitcoin → Starknet swap (phase 1).
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

  /**
   * Creates a Starknet → Lightning swap.
   */
  createStarknetToLightningSwap(params: {
    invoice: LightningInvoice;
    sourceAddress: StarknetAddress;
  }): Promise<AtomiqReverseSwapResult>;

  /**
   * Creates a Starknet → Bitcoin swap.
   */
  createStarknetToBitcoinSwap(params: {
    amountSats: bigint;
    destinationAddress: BitcoinAddress;
    sourceAddress: StarknetAddress;
  }): Promise<AtomiqReverseSwapResult>;

  // ===========================================================================
  // Swap Limits
  // ===========================================================================

  /**
   * Gets limits for Lightning → Starknet swaps.
   */
  getLightningToStarknetLimits(): Promise<SwapLimits>;

  /**
   * Gets limits for Bitcoin → Starknet swaps.
   */
  getBitcoinToStarknetLimits(): Promise<SwapLimits>;

  /**
   * Gets limits for Starknet → Lightning swaps.
   */
  getStarknetToLightningLimits(): Promise<SwapLimits>;

  /**
   * Gets limits for Starknet → Bitcoin swaps.
   */
  getStarknetToBitcoinLimits(): Promise<SwapLimits>;

  // ===========================================================================
  // Swap Monitoring
  // ===========================================================================

  /**
   * Gets the current status of a swap from Atomiq.
   *
   * @param direction - Swap direction, used to correctly interpret SDK state numbers.
   *   For bitcoin_to_starknet swaps, state 1 means "committed" (not "paid"),
   *   so isPaid requires state >= 2.
   */
  getSwapStatus(swapId: SwapId, direction?: SwapDirection): Promise<AtomiqSwapStatus>;

  /**
   * Checks if a swap payment has been received.
   */
  isSwapPaid(swapId: SwapId): Promise<boolean>;

  // ===========================================================================
  // Swap Claiming
  // ===========================================================================

  /**
   * Claims a swap after payment has been received.
   */
  claimSwap(swapId: SwapId): Promise<ClaimResult>;

  /**
   * Waits for claim confirmation.
   */
  waitForClaimConfirmation(swapId: SwapId): Promise<void>;

  /**
   * Gets unsigned claim transactions for manual signing.
   */
  getUnsignedClaimTransactions(swapId: SwapId): Promise<UnsignedClaimTransactions>;
}

// =============================================================================
// Result Types
// =============================================================================

export interface AtomiqSwapResult {
  swapId: string;
  invoice?: string;
  depositAddress?: string;
  bip21Uri?: string;
  expiresAt: Date;
}

export interface AtomiqReverseSwapResult {
  swapId: string;
  commitCalls: StarknetCall[];
  amountSats: bigint;
  expiresAt: Date;
}

export interface AtomiqSwapStatus {
  state: number;
  isPaid: boolean;
  isCompleted: boolean;
  isFailed: boolean;
  isExpired: boolean;
  txHash?: string;
  error?: string;
}

export interface ClaimResult {
  txHash: string;
  success: boolean;
}

export interface UnsignedClaimTransactions {
  transactions: unknown[];
  message: string;
}

export interface BitcoinSwapQuote {
  swapId: string;
  commitCalls: StarknetCall[];
  expiresAt: Date;
}

export interface BitcoinSwapCommitResult {
  depositAddress: string;
  bip21Uri: string;
}
