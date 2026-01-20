import type { UserAddressRepository } from '../ports/user-address.repository';
import { UserAddress } from './user-address';
import { type AddressType, UserAddressId } from './types';
export interface UserAddressUseCasesDeps {
    userAddressRepository: UserAddressRepository;
    idGenerator: () => UserAddressId;
}
export interface FetchUserAddressesInput {
    accountId: string;
}
export interface FetchUserAddressesOutput {
    addresses: UserAddress[];
}
export type FetchUserAddressesUseCase = (input: FetchUserAddressesInput) => Promise<FetchUserAddressesOutput>;
/**
 * Fetches all addresses for an account.
 */
export declare function getFetchUserAddressesUseCase(deps: Pick<UserAddressUseCasesDeps, 'userAddressRepository'>): FetchUserAddressesUseCase;
export interface RegisterUserAddressInput {
    accountId: string;
    starknetAddress: string;
    addressType: AddressType;
}
export interface RegisterUserAddressOutput {
    address: UserAddress;
}
export type RegisterUserAddressUseCase = (input: RegisterUserAddressInput) => Promise<RegisterUserAddressOutput>;
/**
 * Registers a new Starknet address for an account.
 */
export declare function getRegisterUserAddressUseCase(deps: UserAddressUseCasesDeps): RegisterUserAddressUseCase;
export interface DeactivateUserAddressInput {
    addressId: string;
}
export interface DeactivateUserAddressOutput {
    address: UserAddress;
}
export type DeactivateUserAddressUseCase = (input: DeactivateUserAddressInput) => Promise<DeactivateUserAddressOutput>;
/**
 * Deactivates a user address (stops tracking).
 */
export declare function getDeactivateUserAddressUseCase(deps: Pick<UserAddressUseCasesDeps, 'userAddressRepository'>): DeactivateUserAddressUseCase;
//# sourceMappingURL=user-address.usecases.d.ts.map