import { StarknetAddress } from '../account/types';
import { DomainError } from '../shared/errors';
/**
 * Unique identifier for a Swap.
 */
export type SwapId = string & {
    readonly __brand: 'SwapId';
};
export declare namespace SwapId {
    function of(value: string): SwapId;
    function generate(): SwapId;
}
/**
 * Lightning Network invoice (BOLT11 format).
 */
export type LightningInvoice = string & {
    readonly __brand: 'LightningInvoice';
};
export declare namespace LightningInvoice {
    function of(value: string): LightningInvoice;
    function isValid(value: string): boolean;
}
/**
 * Bitcoin address (supports Bech32 and legacy formats).
 */
export type BitcoinAddress = string & {
    readonly __brand: 'BitcoinAddress';
};
export declare namespace BitcoinAddress {
    function of(value: string): BitcoinAddress;
    function isValid(value: string): boolean;
}
export type SwapDirection = 'lightning_to_starknet' | 'bitcoin_to_starknet' | 'starknet_to_lightning' | 'starknet_to_bitcoin';
export declare function isForwardSwap(direction: SwapDirection): boolean;
export declare function isReverseSwap(direction: SwapDirection): boolean;
export type SwapStatus = 'pending' | 'paid' | 'confirming' | 'completed' | 'expired' | 'failed';
export type SwapState = {
    status: 'pending';
} | {
    status: 'paid';
    paidAt: Date;
} | {
    status: 'confirming';
    txHash: string;
    confirmedAt: Date;
} | {
    status: 'completed';
    txHash: string;
    completedAt: Date;
} | {
    status: 'expired';
    expiredAt: Date;
} | {
    status: 'failed';
    error: string;
    failedAt: Date;
};
export interface SwapData {
    id: SwapId;
    direction: SwapDirection;
    amountSats: bigint;
    destinationAddress: string;
    sourceAddress?: string;
    state: SwapState;
    invoice?: string;
    depositAddress?: string;
    expiresAt: Date;
    createdAt: Date;
}
export interface CreateLightningToStarknetParams {
    id: SwapId;
    amountSats: bigint;
    destinationAddress: StarknetAddress;
    invoice: string;
    expiresAt: Date;
}
export interface CreateBitcoinToStarknetParams {
    id: SwapId;
    amountSats: bigint;
    destinationAddress: StarknetAddress;
    depositAddress: string;
    expiresAt: Date;
}
export interface CreateStarknetToLightningParams {
    id: SwapId;
    amountSats: bigint;
    sourceAddress: StarknetAddress;
    invoice: LightningInvoice;
    depositAddress: string;
    expiresAt: Date;
}
export interface CreateStarknetToBitcoinParams {
    id: SwapId;
    amountSats: bigint;
    sourceAddress: StarknetAddress;
    destinationAddress: BitcoinAddress;
    depositAddress: string;
    expiresAt: Date;
}
export interface SwapLimits {
    minSats: bigint;
    maxSats: bigint;
    feePercent: number;
}
export declare class InvalidLightningInvoiceError extends DomainError {
    readonly value: string;
    constructor(value: string);
}
export declare class InvalidBitcoinAddressError extends DomainError {
    readonly value: string;
    constructor(value: string);
}
export declare class SwapNotFoundError extends DomainError {
    readonly swapId: SwapId | string;
    constructor(swapId: SwapId | string);
}
export declare class SwapExpiredError extends DomainError {
    readonly swapId: SwapId;
    constructor(swapId: SwapId);
}
export declare class InvalidSwapStateError extends DomainError {
    readonly currentStatus: SwapStatus;
    readonly attemptedAction: string;
    constructor(currentStatus: SwapStatus, attemptedAction: string);
}
export declare class SwapAmountError extends DomainError {
    readonly amount: bigint;
    readonly min: bigint;
    readonly max: bigint;
    constructor(amount: bigint, min: bigint, max: bigint);
}
export declare class SwapCreationError extends DomainError {
    readonly reason: string;
    constructor(reason: string);
}
export declare class SwapClaimError extends DomainError {
    readonly swapId: SwapId;
    readonly reason: string;
    constructor(swapId: SwapId, reason: string);
}
//# sourceMappingURL=types.d.ts.map