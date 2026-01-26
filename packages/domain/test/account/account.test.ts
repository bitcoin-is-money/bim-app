import {Account, AccountId, CredentialId, StarknetAddress} from "@bim/domain/account";
import {InvalidStateTransitionError} from "@bim/domain/shared";
import {describe, expect, it} from 'vitest';

describe('Account', () => {
  const TEST_STARKNET_ADDRESS = StarknetAddress.of('0x123');

  const createTestAccount = (): Account => {
    return Account.create({
      id: AccountId.of('550e8400-e29b-41d4-a716-446655440000'),
      username: 'alice',
      starknetAddress: TEST_STARKNET_ADDRESS,
      credentialId: CredentialId.of('test-credential-id'),
      publicKey: '0x1234567890abcdef',
      credentialPublicKey: 'encoded-public-key',
    });
  };

  describe('create', () => {
    it('creates account in pending status with starknet address', () => {
      const account = createTestAccount();

      expect(account.id).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(account.username).toBe('alice');
      expect(account.getStatus()).toBe('pending');
      expect(account.getSignCount()).toBe(0);
      expect(account.getStarknetAddress()).toBe(TEST_STARKNET_ADDRESS);
    });

    it('sets createdAt and updatedAt to current time', () => {
      const before = new Date();
      const account = createTestAccount();
      const after = new Date();

      expect(account.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(account.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('fromData', () => {
    it('reconstitutes account from persisted data', () => {
      const data = {
        id: AccountId.of('550e8400-e29b-41d4-a716-446655440000'),
        username: 'bob',
        credentialId: CredentialId.of('cred-id'),
        publicKey: '0xpubkey',
        credentialPublicKey: 'cose-key',
        starknetAddress: StarknetAddress.of('0x123'),
        status: 'deployed' as const,
        deploymentTxHash: '0xtxhash',
        signCount: 5,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
      };

      const account = Account.fromData(data);

      expect(account.id).toBe(data.id);
      expect(account.username).toBe('bob');
      expect(account.getStatus()).toBe('deployed');
      expect(account.getSignCount()).toBe(5);
      expect(account.getStarknetAddress()).toBe(data.starknetAddress);
    });
  });

  describe('markAsDeploying', () => {
    it('transitions from pending to deploying', () => {
      const account = createTestAccount();

      account.markAsDeploying('0xtxhash');

      expect(account.getStatus()).toBe('deploying');
      expect(account.getDeploymentTxHash()).toBe('0xtxhash');
    });

    it('throws when not in pending status', () => {
      const account = createTestAccount();
      account.markAsDeploying('0xtx1');

      expect(() => account.markAsDeploying('0xtx2'))
        .toThrow(InvalidStateTransitionError);
    });
  });

  describe('markAsDeployed', () => {
    it('transitions from deploying to deployed', () => {
      const account = createTestAccount();
      account.markAsDeploying('0xtx');

      account.markAsDeployed();

      expect(account.getStatus()).toBe('deployed');
      expect(account.isDeployed()).toBe(true);
    });

    it('throws when not in deploying status', () => {
      const account = createTestAccount();

      expect(() => account.markAsDeployed())
        .toThrow(InvalidStateTransitionError);
    });
  });

  describe('markAsFailed', () => {
    it('transitions from deploying to failed', () => {
      const account = createTestAccount();
      account.markAsDeploying('0xtx');

      account.markAsFailed();

      expect(account.getStatus()).toBe('failed');
    });

    it('throws when not in deploying status', () => {
      const account = createTestAccount();

      expect(() => account.markAsFailed())
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

      expect(() => account.updateSignCount(5))
        .toThrow(InvalidStateTransitionError);
      expect(() => account.updateSignCount(3))
        .toThrow(InvalidStateTransitionError);
    });
  });

  describe('canDeploy', () => {
    it('returns true when pending with starknet address', () => {
      const account = createTestAccount();

      expect(account.canDeploy()).toBe(true);
    });

    it('returns false when not pending', () => {
      const account = createTestAccount();
      account.markAsDeploying('0xtx');

      expect(account.canDeploy()).toBe(false);
    });
  });

  describe('toData', () => {
    it('exports account data for persistence', () => {
      const account = createTestAccount();

      const data = account.toData();

      expect(data.id).toBe(account.id);
      expect(data.username).toBe('alice');
      expect(data.status).toBe('pending');
      expect(data.signCount).toBe(0);
      expect(data.starknetAddress).toBe(TEST_STARKNET_ADDRESS);
    });
  });
});
