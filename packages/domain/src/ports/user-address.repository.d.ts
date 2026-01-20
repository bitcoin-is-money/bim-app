import { AccountId, StarknetAddress } from '../account/types';
import { UserAddress } from '../user/user-address';
import { UserAddressId } from '../user/types';
/**
 * Repository interface for UserAddress persistence.
 */
export interface UserAddressRepository {
    /**
     * Saves a user address (insert or update).
     */
    save(address: UserAddress): Promise<void>;
    /**
     * Finds a user address by ID.
     */
    findById(id: UserAddressId): Promise<UserAddress | undefined>;
    /**
     * Finds all addresses for an account.
     */
    findByAccountId(accountId: AccountId): Promise<UserAddress[]>;
    /**
     * Finds a user address by its Starknet address.
     */
    findByStarknetAddress(starknetAddress: StarknetAddress): Promise<UserAddress | undefined>;
    /**
     * Finds all active addresses (for blockchain scanning).
     */
    findAllActive(): Promise<UserAddress[]>;
}
//# sourceMappingURL=user-address.repository.d.ts.map