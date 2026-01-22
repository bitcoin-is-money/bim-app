import {AccountId, StarknetAddress} from '@bim/domain/account';
import {WatchedAddress, WatchedAddressId} from '@bim/domain/user';
import {describe, expect, it} from 'vitest';

describe('WatchedAddress', () => {
  const accountId = AccountId.of('550e8400-e29b-41d4-a716-446655440000');
  const addressId = WatchedAddressId.of('660e8400-e29b-41d4-a716-446655440001');
  const starknetAddress = StarknetAddress.of('0x123');

  describe('create', () => {
    it('creates address with correct properties', () => {
      const address = WatchedAddress.create({
        id: addressId,
        accountId,
        starknetAddress,
        addressType: 'main',
      });

      expect(address.id).toBe(addressId);
      expect(address.accountId).toBe(accountId);
      expect(address.starknetAddress).toBe(starknetAddress);
      expect(address.addressType).toBe('main');
      expect(address.getIsActive()).toBe(true);
      expect(address.getLastScannedBlock()).toBeUndefined();
    });

    it('sets registeredAt to current time', () => {
      const before = new Date();
      const address = WatchedAddress.create({
        id: addressId,
        accountId,
        starknetAddress,
        addressType: 'main',
      });
      const after = new Date();

      expect(address.registeredAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(address.registeredAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('fromData', () => {
    it('reconstitutes address from persisted data', () => {
      const data = {
        id: addressId,
        accountId,
        starknetAddress,
        addressType: 'imported' as const,
        isActive: false,
        registeredAt: new Date('2024-01-01'),
        lastScannedBlock: 12345n,
      };

      const address = WatchedAddress.fromData(data);

      expect(address.id).toBe(addressId);
      expect(address.addressType).toBe('imported');
      expect(address.getIsActive()).toBe(false);
      expect(address.getLastScannedBlock()).toBe(12345n);
    });
  });

  describe('activate/deactivate', () => {
    it('activates address', () => {
      const address = WatchedAddress.create({
        id: addressId,
        accountId,
        starknetAddress,
        addressType: 'main',
      });
      address.deactivate();

      address.activate();

      expect(address.getIsActive()).toBe(true);
    });

    it('deactivates address', () => {
      const address = WatchedAddress.create({
        id: addressId,
        accountId,
        starknetAddress,
        addressType: 'main',
      });

      address.deactivate();

      expect(address.getIsActive()).toBe(false);
    });
  });

  describe('updateLastScannedBlock', () => {
    it('updates last scanned block', () => {
      const address = WatchedAddress.create({
        id: addressId,
        accountId,
        starknetAddress,
        addressType: 'main',
      });

      address.updateLastScannedBlock(100n);

      expect(address.getLastScannedBlock()).toBe(100n);
    });

    it('updates to higher block number', () => {
      const address = WatchedAddress.create({
        id: addressId,
        accountId,
        starknetAddress,
        addressType: 'main',
      });
      address.updateLastScannedBlock(100n);

      address.updateLastScannedBlock(200n);

      expect(address.getLastScannedBlock()).toBe(200n);
    });

    it('does not update to lower block number', () => {
      const address = WatchedAddress.create({
        id: addressId,
        accountId,
        starknetAddress,
        addressType: 'main',
      });
      address.updateLastScannedBlock(100n);

      address.updateLastScannedBlock(50n);

      expect(address.getLastScannedBlock()).toBe(100n);
    });

    it('does not update to same block number', () => {
      const address = WatchedAddress.create({
        id: addressId,
        accountId,
        starknetAddress,
        addressType: 'main',
      });
      address.updateLastScannedBlock(100n);

      address.updateLastScannedBlock(100n);

      expect(address.getLastScannedBlock()).toBe(100n);
    });
  });

  describe('toData', () => {
    it('exports all address data', () => {
      const address = WatchedAddress.create({
        id: addressId,
        accountId,
        starknetAddress,
        addressType: 'main',
      });
      address.updateLastScannedBlock(500n);

      const data = address.toData();

      expect(data.id).toBe(addressId);
      expect(data.accountId).toBe(accountId);
      expect(data.starknetAddress).toBe(starknetAddress);
      expect(data.addressType).toBe('main');
      expect(data.isActive).toBe(true);
      expect(data.lastScannedBlock).toBe(500n);
    });
  });
});
