import {AccountId, StarknetAddress} from '../account';
import {WatchedAddress, WatchedAddressId} from '../user';

/**
 * Repository interface for WatchedAddress persistence.
 */
export interface WatchedAddressRepository {
  /**
   * Saves a watched address (insert or update).
   */
  save(address: WatchedAddress): Promise<void>;

  /**
   * Finds a watched address by ID.
   */
  findById(id: WatchedAddressId): Promise<WatchedAddress | undefined>;

  /**
   * Finds all addresses for an account.
   */
  findByAccountId(accountId: AccountId): Promise<WatchedAddress[]>;

  /**
   * Finds a watched address by its Starknet address.
   */
  findByStarknetAddress(starknetAddress: StarknetAddress): Promise<WatchedAddress | undefined>;

  /**
   * Finds all active addresses (for blockchain scanning).
   */
  findAllActive(): Promise<WatchedAddress[]>;
}
