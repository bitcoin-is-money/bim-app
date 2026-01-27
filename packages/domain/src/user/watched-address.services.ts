import {AccountId, StarknetAddress} from '../account';
import type {WatchedAddressRepository} from '../ports';
import {
  type AddressType,
  WatchedAddressAlreadyExistsError,
  WatchedAddressId,
  WatchedAddressNotFoundError,
} from './types';
import {WatchedAddress} from './watched-address';

// =============================================================================
// Shared Dependencies
// =============================================================================

export interface WatchedAddressServicesDeps {
  watchedAddressRepository: WatchedAddressRepository;
  idGenerator: () => WatchedAddressId;
}

// =============================================================================
// Fetch Watched Addresses
// =============================================================================

export interface FetchWatchedAddressesInput {
  accountId: string;
}

export interface FetchWatchedAddressesOutput {
  addresses: WatchedAddress[];
}

export type FetchWatchedAddressesService = (
  input: FetchWatchedAddressesInput,
) => Promise<FetchWatchedAddressesOutput>;

/**
 * Fetches all watched addresses for an account.
 */
export function getFetchWatchedAddressesService(
  deps: Pick<WatchedAddressServicesDeps, 'watchedAddressRepository'>,
): FetchWatchedAddressesService {
  return async (input: FetchWatchedAddressesInput): Promise<FetchWatchedAddressesOutput> => {
    const accountId = AccountId.of(input.accountId);
    const addresses = await deps.watchedAddressRepository.findByAccountId(accountId);
    return {addresses};
  };
}

// =============================================================================
// Register Watched Address
// =============================================================================

export interface RegisterWatchedAddressInput {
  accountId: string;
  starknetAddress: string;
  addressType: AddressType;
}

export interface RegisterWatchedAddressOutput {
  address: WatchedAddress;
}

export type RegisterWatchedAddressService = (
  input: RegisterWatchedAddressInput,
) => Promise<RegisterWatchedAddressOutput>;

/**
 * Registers a new Starknet address for watching.
 */
export function getRegisterWatchedAddressService(
  deps: WatchedAddressServicesDeps,
): RegisterWatchedAddressService {
  return async (input: RegisterWatchedAddressInput): Promise<RegisterWatchedAddressOutput> => {
    const accountId = AccountId.of(input.accountId);
    const starknetAddress = StarknetAddress.of(input.starknetAddress);

    // Check if address is already registered
    const existing = await deps.watchedAddressRepository.findByStarknetAddress(starknetAddress);
    if (existing) {
      throw new WatchedAddressAlreadyExistsError(starknetAddress);
    }

    const address = WatchedAddress.create({
      id: deps.idGenerator(),
      accountId,
      starknetAddress,
      addressType: input.addressType,
    });

    await deps.watchedAddressRepository.save(address);

    return {address};
  };
}

// =============================================================================
// Deactivate Watched Address
// =============================================================================

export interface DeactivateWatchedAddressInput {
  addressId: string;
}

export interface DeactivateWatchedAddressOutput {
  address: WatchedAddress;
}

export type DeactivateWatchedAddressService = (
  input: DeactivateWatchedAddressInput,
) => Promise<DeactivateWatchedAddressOutput>;

/**
 * Deactivates a watched address (stops tracking).
 */
export function getDeactivateWatchedAddressService(
  deps: Pick<WatchedAddressServicesDeps, 'watchedAddressRepository'>,
): DeactivateWatchedAddressService {
  return async (input: DeactivateWatchedAddressInput): Promise<DeactivateWatchedAddressOutput> => {
    const addressId = WatchedAddressId.of(input.addressId);

    const address = await deps.watchedAddressRepository.findById(addressId);
    if (!address) {
      throw new WatchedAddressNotFoundError(addressId);
    }

    address.deactivate();
    await deps.watchedAddressRepository.save(address);

    return {address};
  };
}
