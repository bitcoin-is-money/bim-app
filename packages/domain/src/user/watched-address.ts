import {AccountId, StarknetAddress} from '../account';
import {type AddressType, type WatchedAddressData, WatchedAddressId,} from './types';

/**
 * WatchedAddress entity representing a tracked Starknet address for polling.
 */
export class WatchedAddress {
  private isActive: boolean;
  private lastScannedBlock?: bigint;

  private constructor(
    readonly id: WatchedAddressId,
    readonly accountId: AccountId,
    readonly starknetAddress: StarknetAddress,
    readonly addressType: AddressType,
    readonly registeredAt: Date,
    isActive: boolean,
    lastScannedBlock?: bigint,
  ) {
    this.isActive = isActive;
    this.lastScannedBlock = lastScannedBlock;
  }

  /**
   * Creates a new watched address.
   */
  static create(params: {
    id: WatchedAddressId;
    accountId: AccountId;
    starknetAddress: StarknetAddress;
    addressType: AddressType;
  }): WatchedAddress {
    return new WatchedAddress(
      params.id,
      params.accountId,
      params.starknetAddress,
      params.addressType,
      new Date(),
      true,
      undefined,
    );
  }

  /**
   * Reconstitutes watched address from persisted data.
   */
  static fromData(data: WatchedAddressData): WatchedAddress {
    return new WatchedAddress(
      data.id,
      data.accountId,
      data.starknetAddress,
      data.addressType,
      data.registeredAt,
      data.isActive,
      data.lastScannedBlock,
    );
  }

  /**
   * Returns whether the address is active.
   */
  getIsActive(): boolean {
    return this.isActive;
  }

  /**
   * Returns the last scanned block number.
   */
  getLastScannedBlock(): bigint | undefined {
    return this.lastScannedBlock;
  }

  /**
   * Activates the address for tracking.
   */
  activate(): void {
    this.isActive = true;
  }

  /**
   * Deactivates the address from tracking.
   */
  deactivate(): void {
    this.isActive = false;
  }

  /**
   * Updates the last scanned block number.
   */
  updateLastScannedBlock(blockNumber: bigint): void {
    if (this.lastScannedBlock !== undefined && blockNumber <= this.lastScannedBlock) {
      return; // Don't go backwards
    }
    this.lastScannedBlock = blockNumber;
  }

  /**
   * Exports the address data for persistence.
   */
  toData(): WatchedAddressData {
    return {
      id: this.id,
      accountId: this.accountId,
      starknetAddress: this.starknetAddress,
      addressType: this.addressType,
      isActive: this.isActive,
      registeredAt: this.registeredAt,
      lastScannedBlock: this.lastScannedBlock,
    };
  }
}
