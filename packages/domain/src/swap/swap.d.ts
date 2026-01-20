import { type CreateBitcoinToStarknetParams, type CreateLightningToStarknetParams, type CreateStarknetToBitcoinParams, type CreateStarknetToLightningParams, type SwapData, type SwapDirection, SwapId, type SwapState, type SwapStatus } from './types';
/**
 * Swap entity representing a cross-chain swap operation.
 *
 * Supports four swap directions:
 * - Lightning → Starknet (forward)
 * - Bitcoin → Starknet (forward)
 * - Starknet → Lightning (reverse)
 * - Starknet → Bitcoin (reverse)
 */
export declare class Swap {
    readonly id: SwapId;
    readonly direction: SwapDirection;
    readonly amountSats: bigint;
    readonly destinationAddress: string;
    readonly sourceAddress: string | undefined;
    readonly invoice: string | undefined;
    readonly depositAddress: string | undefined;
    readonly expiresAt: Date;
    readonly createdAt: Date;
    private state;
    private constructor();
    /**
     * Creates a Lightning → Starknet swap.
     */
    static createLightningToStarknet(params: CreateLightningToStarknetParams): Swap;
    /**
     * Creates a Bitcoin → Starknet swap.
     */
    static createBitcoinToStarknet(params: CreateBitcoinToStarknetParams): Swap;
    /**
     * Creates a Starknet → Lightning swap.
     */
    static createStarknetToLightning(params: CreateStarknetToLightningParams): Swap;
    /**
     * Creates a Starknet → Bitcoin swap.
     */
    static createStarknetToBitcoin(params: CreateStarknetToBitcoinParams): Swap;
    /**
     * Reconstitutes a Swap from persisted data.
     */
    static fromData(data: SwapData): Swap;
    /**
     * Returns the current status of the swap.
     */
    getStatus(): SwapStatus;
    /**
     * Returns the full state of the swap.
     */
    getState(): SwapState;
    /**
     * Returns the transaction hash if available.
     */
    getTxHash(): string | undefined;
    /**
     * Checks if this is a forward swap (into Starknet).
     */
    isForward(): boolean;
    /**
     * Checks if the swap has expired.
     */
    isExpired(): boolean;
    /**
     * Checks if the swap is in a terminal state.
     */
    isTerminal(): boolean;
    /**
     * Checks if the swap can be claimed.
     */
    canClaim(): boolean;
    /**
     * Marks the swap as paid (payment received for forward swaps,
     * or deposit detected for reverse swaps).
     */
    markAsPaid(): void;
    /**
     * Marks the swap as confirming (claim transaction submitted).
     */
    markAsConfirming(txHash: string): void;
    /**
     * Marks the swap as completed.
     */
    markAsCompleted(txHash?: string): void;
    /**
     * Marks the swap as expired.
     */
    markAsExpired(): void;
    /**
     * Marks the swap as failed.
     */
    markAsFailed(error: string): void;
    /**
     * Calculates the progress percentage (0-100).
     */
    getProgress(): number;
    /**
     * Exports the swap data for persistence.
     */
    toData(): SwapData;
}
//# sourceMappingURL=swap.d.ts.map