import { AccountId, StarknetAddress } from '../account/types';
import { type AddressType, type UserAddressData, UserAddressId } from './types';
/**
 * UserAddress entity representing a tracked Starknet address for a user.
 */
export declare class UserAddress {
    readonly id: UserAddressId;
    readonly accountId: AccountId;
    readonly starknetAddress: StarknetAddress;
    readonly addressType: AddressType;
    readonly registeredAt: Date;
    private isActive;
    private lastScannedBlock?;
    private constructor();
    /**
     * Creates a new user address.
     */
    static create(params: {
        id: UserAddressId;
        accountId: AccountId;
        starknetAddress: StarknetAddress;
        addressType: AddressType;
    }): UserAddress;
    /**
     * Reconstitutes user address from persisted data.
     */
    static fromData(data: UserAddressData): UserAddress;
    /**
     * Returns whether the address is active.
     */
    getIsActive(): boolean;
    /**
     * Returns the last scanned block number.
     */
    getLastScannedBlock(): bigint | undefined;
    /**
     * Activates the address for tracking.
     */
    activate(): void;
    /**
     * Deactivates the address from tracking.
     */
    deactivate(): void;
    /**
     * Updates the last scanned block number.
     */
    updateLastScannedBlock(blockNumber: bigint): void;
    /**
     * Exports the address data for persistence.
     */
    toData(): UserAddressData;
}
//# sourceMappingURL=user-address.d.ts.map