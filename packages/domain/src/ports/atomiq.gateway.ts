import {StarknetAddress} from '../account/types';
import {BitcoinAddress, LightningInvoice, SwapId, type SwapLimits} from '../swap/types';

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
  }): Promise<AtomiqSwapResult>;

  /**
   * Creates a Bitcoin → Starknet swap.
   */
  createBitcoinToStarknetSwap(params: {
    amountSats: bigint;
    destinationAddress: StarknetAddress;
  }): Promise<AtomiqSwapResult>;

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
   * Registers a swap for monitoring.
   */
  registerSwapForMonitoring(swapId: SwapId, swapObject: unknown): Promise<void>;

  /**
   * Gets the current status of a swap from Atomiq.
   */
  getSwapStatus(swapId: SwapId): Promise<AtomiqSwapStatus>;

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
  swapObject: unknown;
}

export interface AtomiqReverseSwapResult {
  swapId: string;
  depositAddress: string;
  amountSats: bigint;
  expiresAt: Date;
  swapObject: unknown;
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
