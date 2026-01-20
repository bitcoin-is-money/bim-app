import {AccountId, StarknetAddress} from '../account/types';
import {type AddressType, type UserAddressData, UserAddressId,} from './types';

/**
 * UserAddress entity representing a tracked Starknet address for a user.
 */
export class UserAddress {
  private isActive: boolean;
  private lastScannedBlock?: bigint;

  private constructor(
    readonly id: UserAddressId,
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
   * Creates a new user address.
   */
  static create(params: {
    id: UserAddressId;
    accountId: AccountId;
    starknetAddress: StarknetAddress;
    addressType: AddressType;
  }): UserAddress {
    return new UserAddress(
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
   * Reconstitutes user address from persisted data.
   */
  static fromData(data: UserAddressData): UserAddress {
    return new UserAddress(
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
  toData(): UserAddressData {
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
