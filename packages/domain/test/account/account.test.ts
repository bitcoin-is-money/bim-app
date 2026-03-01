import {Account, AccountId, CredentialId, StarknetAddress} from "@bim/domain/account";
import {InvalidStateTransitionError} from "@bim/domain/shared";
import {describe, expect, it} from 'vitest';

describe('Account', () => {
  const TEST_STARKNET_ADDRESS = StarknetAddress.of('0x123');

  const createTestAccount = (): Account => {
    return Account.create({
      id: AccountId.of('550e8400-e29b-41d4-a716-446655440000'),
      username: 'alice',
      credentialId: CredentialId.of('test-credential-id'),
      publicKey: '0x1234567890abcdef',
      credentialPublicKey: 'encoded-public-key',
    });
  };

  describe('create', () => {
    it('creates account in pending status without starknet address', () => {
      const account = createTestAccount();

      expect(account.id).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(account.username).toBe('alice');
      expect(account.getStatus()).toBe('pending');
      expect(account.getSignCount()).toBe(0);
      expect(account.getStarknetAddress()).toBeUndefined();
    });

    it('sets createdAt and updatedAt to current time', () => {
      const before = new Date();
      const account = createTestAccount();
      const after = new Date();

      expect(account.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(account.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('markAsDeploying', () => {
    it('transitions from pending to deploying with starknet address', () => {
      const account = createTestAccount();

      account.markAsDeploying(TEST_STARKNET_ADDRESS, '0xtxhash');

      expect(account.getStatus()).toBe('deploying');
      expect(account.getStarknetAddress()).toBe(TEST_STARKNET_ADDRESS);
      expect(account.getDeploymentTxHash()).toBe('0xtxhash');
    });

    it('throws when not in pending status', () => {
      const account = createTestAccount();
      account.markAsDeploying(TEST_STARKNET_ADDRESS, '0xtx1');

      expect(() => { account.markAsDeploying(TEST_STARKNET_ADDRESS, '0xtx2'); })
        .toThrow(InvalidStateTransitionError);
    });
  });

  describe('markAsDeployed', () => {
    it('transitions from deploying to deployed', () => {
      const account = createTestAccount();
      account.markAsDeploying(TEST_STARKNET_ADDRESS, '0xtx');

      account.markAsDeployed();

      expect(account.getStatus()).toBe('deployed');
      expect(account.isDeployed()).toBe(true);
    });

    it('throws when not in deploying status', () => {
      const account = createTestAccount();

      expect(() => { account.markAsDeployed(); })
        .toThrow(InvalidStateTransitionError);
    });
  });

  describe('markAsFailed', () => {
    it('transitions from deploying to failed', () => {
      const account = createTestAccount();
      account.markAsDeploying(TEST_STARKNET_ADDRESS, '0xtx');

      account.markAsFailed();

      expect(account.getStatus()).toBe('failed');
    });

    it('throws when not in deploying status', () => {
      const account = createTestAccount();

      expect(() => { account.markAsFailed(); })
        .toThrow(InvalidStateTransitionError);
    });
  });

  describe('updateSignCount', () => {
    it('updates sign count when new count is higher', () => {
      const account = createTestAccount();

      account.updateSignCount(5);

      expect(account.getSignCount()).toBe(5);
    });

    it('throws when new count is not higher', () => {
      const account = createTestAccount();
      account.updateSignCount(5);

      expect(() => { account.updateSignCount(5); })
        .toThrow(InvalidStateTransitionError);
      expect(() => { account.updateSignCount(3); })
        .toThrow(InvalidStateTransitionError);
    });
  });

  describe('canDeploy', () => {
    it('returns true when pending', () => {
      const account = createTestAccount();

      expect(account.canDeploy()).toBe(true);
    });

    it('returns false when not pending', () => {
      const account = createTestAccount();
      account.markAsDeploying(TEST_STARKNET_ADDRESS, '0xtx');

      expect(account.canDeploy()).toBe(false);
    });
  });

});
