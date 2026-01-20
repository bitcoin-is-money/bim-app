import {AccountId, StarknetAddress} from '@bim/domain/account';
import type {UserAddressRepository} from '@bim/domain/ports';
import {
  getDeactivateUserAddressUseCase,
  getFetchUserAddressesUseCase,
  getRegisterUserAddressUseCase,
  UserAddress,
  UserAddressAlreadyExistsError,
  UserAddressId,
  UserAddressNotFoundError
} from '@bim/domain/user';
import {beforeEach, describe, expect, it, vi} from 'vitest';

describe('UserAddress UseCases', () => {
  const accountId = AccountId.of('550e8400-e29b-41d4-a716-446655440000');
  const addressId = UserAddressId.of('660e8400-e29b-41d4-a716-446655440001');
  const starknetAddress = StarknetAddress.of('0x123');

  let mockRepository: UserAddressRepository;
  let idGenerator: () => UserAddressId;

  beforeEach(() => {
    mockRepository = {
      save: vi.fn(),
      findById: vi.fn(),
      findByAccountId: vi.fn(),
      findByStarknetAddress: vi.fn(),
      findAllActive: vi.fn(),
    };
    idGenerator = () => addressId;
  });

  describe('getFetchUserAddressesUseCase', () => {
    it('returns addresses for account', async () => {
      const address1 = UserAddress.create({
        id: addressId,
        accountId,
        starknetAddress,
        addressType: 'main',
      });
      const address2 = UserAddress.create({
        id: UserAddressId.of('770e8400-e29b-41d4-a716-446655440002'),
        accountId,
        starknetAddress: StarknetAddress.of('0x456'),
        addressType: 'imported',
      });
      vi.mocked(mockRepository.findByAccountId).mockResolvedValue([address1, address2]);

      const useCase = getFetchUserAddressesUseCase({
        userAddressRepository: mockRepository,
      });
      const result = await useCase({accountId: accountId});

      expect(result.addresses).toHaveLength(2);
      expect(result.addresses[0].addressType).toBe('main');
      expect(result.addresses[1].addressType).toBe('imported');
    });

    it('returns empty array if no addresses', async () => {
      vi.mocked(mockRepository.findByAccountId).mockResolvedValue([]);

      const useCase = getFetchUserAddressesUseCase({
        userAddressRepository: mockRepository,
      });
      const result = await useCase({accountId: accountId});

      expect(result.addresses).toHaveLength(0);
    });
  });

  describe('getRegisterUserAddressUseCase', () => {
    it('registers new address', async () => {
      vi.mocked(mockRepository.findByStarknetAddress).mockResolvedValue(undefined);

      const useCase = getRegisterUserAddressUseCase({
        userAddressRepository: mockRepository,
        idGenerator,
      });
      const result = await useCase({
        accountId: accountId,
        starknetAddress: '0x789',
        addressType: 'imported',
      });

      expect(result.address.addressType).toBe('imported');
      expect(result.address.getIsActive()).toBe(true);
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('throws if address already registered', async () => {
      const existingAddress = UserAddress.create({
        id: addressId,
        accountId,
        starknetAddress,
        addressType: 'main',
      });
      vi.mocked(mockRepository.findByStarknetAddress).mockResolvedValue(existingAddress);

      const useCase = getRegisterUserAddressUseCase({
        userAddressRepository: mockRepository,
        idGenerator,
      });

      expect(
        useCase({
          accountId: accountId,
          starknetAddress: starknetAddress,
          addressType: 'imported',
        }),
      ).rejects.toThrow(UserAddressAlreadyExistsError);
    });
  });

  describe('getDeactivateUserAddressUseCase', () => {
    it('deactivates existing address', async () => {
      const address = UserAddress.create({
        id: addressId,
        accountId,
        starknetAddress,
        addressType: 'main',
      });
      vi.mocked(mockRepository.findById).mockResolvedValue(address);

      const useCase = getDeactivateUserAddressUseCase({
        userAddressRepository: mockRepository,
      });
      const result = await useCase({addressId: addressId});

      expect(result.address.getIsActive()).toBe(false);
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('throws if address not found', async () => {
      vi.mocked(mockRepository.findById).mockResolvedValue(undefined);

      const useCase = getDeactivateUserAddressUseCase({
        userAddressRepository: mockRepository,
      });

      await expect(
        useCase({addressId: addressId}),
      ).rejects.toThrow(UserAddressNotFoundError);
    });
  });
});
