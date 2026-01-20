import {AccountId, StarknetAddress} from '@bim/domain/account';
import type {UserAddressRepository} from '@bim/domain/ports';
import {type AddressType, UserAddressAlreadyExistsError, UserAddressId, UserAddressNotFoundError,} from './types';
import {UserAddress} from './user-address';

// =============================================================================
// Shared Dependencies
// =============================================================================

export interface UserAddressUseCasesDeps {
  userAddressRepository: UserAddressRepository;
  idGenerator: () => UserAddressId;
}

// =============================================================================
// Fetch User Addresses
// =============================================================================

export interface FetchUserAddressesInput {
  accountId: string;
}

export interface FetchUserAddressesOutput {
  addresses: UserAddress[];
}

export type FetchUserAddressesUseCase = (
  input: FetchUserAddressesInput,
) => Promise<FetchUserAddressesOutput>;

/**
 * Fetches all addresses for an account.
 */
export function getFetchUserAddressesUseCase(
  deps: Pick<UserAddressUseCasesDeps, 'userAddressRepository'>,
): FetchUserAddressesUseCase {
  return async (input: FetchUserAddressesInput): Promise<FetchUserAddressesOutput> => {
    const accountId = AccountId.of(input.accountId);
    const addresses = await deps.userAddressRepository.findByAccountId(accountId);
    return {addresses};
  };
}

// =============================================================================
// Register User Address
// =============================================================================

export interface RegisterUserAddressInput {
  accountId: string;
  starknetAddress: string;
  addressType: AddressType;
}

export interface RegisterUserAddressOutput {
  address: UserAddress;
}

export type RegisterUserAddressUseCase = (
  input: RegisterUserAddressInput,
) => Promise<RegisterUserAddressOutput>;

/**
 * Registers a new Starknet address for an account.
 */
export function getRegisterUserAddressUseCase(
  deps: UserAddressUseCasesDeps,
): RegisterUserAddressUseCase {
  return async (input: RegisterUserAddressInput): Promise<RegisterUserAddressOutput> => {
    const accountId = AccountId.of(input.accountId);
    const starknetAddress = StarknetAddress.of(input.starknetAddress);

    // Check if address is already registered
    const existing = await deps.userAddressRepository.findByStarknetAddress(starknetAddress);
    if (existing) {
      throw new UserAddressAlreadyExistsError(starknetAddress);
    }

    const address = UserAddress.create({
      id: deps.idGenerator(),
      accountId,
      starknetAddress,
      addressType: input.addressType,
    });

    await deps.userAddressRepository.save(address);

    return {address};
  };
}

// =============================================================================
// Deactivate User Address
// =============================================================================

export interface DeactivateUserAddressInput {
  addressId: string;
}

export interface DeactivateUserAddressOutput {
  address: UserAddress;
}

export type DeactivateUserAddressUseCase = (
  input: DeactivateUserAddressInput,
) => Promise<DeactivateUserAddressOutput>;

/**
 * Deactivates a user address (stops tracking).
 */
export function getDeactivateUserAddressUseCase(
  deps: Pick<UserAddressUseCasesDeps, 'userAddressRepository'>,
): DeactivateUserAddressUseCase {
  return async (input: DeactivateUserAddressInput): Promise<DeactivateUserAddressOutput> => {
    const addressId = UserAddressId.of(input.addressId);

    const address = await deps.userAddressRepository.findById(addressId);
    if (!address) {
      throw new UserAddressNotFoundError(addressId);
    }

    address.deactivate();
    await deps.userAddressRepository.save(address);

    return {address};
  };
}
