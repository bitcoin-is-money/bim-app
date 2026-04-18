import {
  AccountId,
  CredentialId,
  InvalidAccountIdError,
  InvalidStarknetAddressError,
  InvalidUsernameError,
  StarknetAddress,
  Username
} from "@bim/domain/account";
import {describe, expect, it} from 'vitest';

describe('Username', () => {
  describe('PATTERN', () => {
    it('matches valid usernames', () => {
      expect(Username.PATTERN.test('alice')).toBe(true);
      expect(Username.PATTERN.test('bob123')).toBe(true);
      expect(Username.PATTERN.test('john_doe')).toBe(true);
      expect(Username.PATTERN.test('ABC')).toBe(true);
      expect(Username.PATTERN.test('a1_b2_c3')).toBe(true);
    });

    it('rejects invalid usernames', () => {
      expect(Username.PATTERN.test('ab')).toBe(false); // too short
      expect(Username.PATTERN.test('a'.repeat(26))).toBe(false); // too long
      expect(Username.PATTERN.test('john-doe')).toBe(false); // hyphen not allowed
      expect(Username.PATTERN.test('john doe')).toBe(false); // space not allowed
      expect(Username.PATTERN.test('john@doe')).toBe(false); // special char
      expect(Username.PATTERN.test('')).toBe(false); // empty
    });
  });

  describe('of', () => {
    it('creates Username from valid string', () => {
      const username = Username.of('alice');
      expect(username).toBe('alice');
    });

    it('trims whitespace', () => {
      const username = Username.of('  alice  ');
      expect(username).toBe('alice');
    });

    it('throws InvalidUsernameError with username in args for invalid username', () => {
      let caught: InvalidUsernameError | undefined;
      try {
        Username.of('ab');
      } catch (err: unknown) {
        caught = err as InvalidUsernameError;
      }
      expect(caught).toBeInstanceOf(InvalidUsernameError);
      expect(caught!.args).toEqual({username: 'ab'});
    });
  });

  describe('isValid', () => {
    it('returns true for valid usernames', () => {
      expect(Username.isValid('alice')).toBe(true);
      expect(Username.isValid('bob_123')).toBe(true);
    });

    it('returns false for invalid usernames', () => {
      expect(Username.isValid('ab')).toBe(false);
      expect(Username.isValid('john-doe')).toBe(false);
    });

    it('handles whitespace in validation', () => {
      expect(Username.isValid('  alice  ')).toBe(true);
    });
  });
});

describe('AccountId', () => {
  describe('of', () => {
    it('creates AccountId from valid UUID', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const accountId = AccountId.of(uuid);
      expect(accountId).toBe(uuid);
    });

    it('accepts lowercase UUID', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const accountId = AccountId.of(uuid);
      expect(accountId).toBe(uuid);
    });

    it('accepts uppercase UUID', () => {
      const uuid = '550E8400-E29B-41D4-A716-446655440000';
      const accountId = AccountId.of(uuid);
      expect(accountId).toBe(uuid);
    });

    it('throws InvalidAccountIdError for invalid UUID', () => {
      expect(() => AccountId.of('not-a-uuid')).toThrow(InvalidAccountIdError);
      expect(() => AccountId.of('')).toThrow(InvalidAccountIdError);
      expect(() => AccountId.of('550e8400-e29b-41d4-a716')).toThrow(InvalidAccountIdError);
    });
  });

  describe('generate', () => {
    it('generates valid UUID', () => {
      const accountId = AccountId.generate();
      expect(accountId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('generates unique IDs', () => {
      const id1 = AccountId.generate();
      const id2 = AccountId.generate();
      expect(id1).not.toBe(id2);
    });
  });
});

describe('StarknetAddress', () => {
  describe('of', () => {
    it('creates StarknetAddress from valid hex', () => {
      const address = StarknetAddress.of('0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7');
      expect(address).toBe('0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7');
    });

    it('normalizes to lowercase', () => {
      const address = StarknetAddress.of('0x049D36570D4E46F48E99674BD3FCC84644DDD6B96F7C741B1562B82F9E004DC7');
      expect(address).toBe('0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7');
    });

    it('pads short addresses to 66 characters', () => {
      const address = StarknetAddress.of('0x123');
      expect(address.length).toBe(66);
      expect(address).toBe('0x0000000000000000000000000000000000000000000000000000000000000123');
    });

    it('trims whitespace', () => {
      const address = StarknetAddress.of('  0x123  ');
      expect(address).toBe('0x0000000000000000000000000000000000000000000000000000000000000123');
    });

    it('throws InvalidStarknetAddressError for invalid address', () => {
      expect(() => StarknetAddress.of('not-an-address')).toThrow(InvalidStarknetAddressError);
      expect(() => StarknetAddress.of('123')).toThrow(InvalidStarknetAddressError); // no 0x prefix
      expect(() => StarknetAddress.of('0xGGG')).toThrow(InvalidStarknetAddressError); // invalid hex
    });

    it('throws InvalidStarknetAddressError for zero address', () => {
      expect(() => StarknetAddress.of('0x0')).toThrow(InvalidStarknetAddressError);
    });

    it('throws InvalidStarknetAddressError for value >= felt252 prime', () => {
      // Stark field prime = 2^251 + 17 * 2^192 + 1
      const overflowHex = '0x' + 'f'.repeat(64);
      expect(() => StarknetAddress.of(overflowHex)).toThrow(InvalidStarknetAddressError);
    });
  });

  describe('isValid', () => {
    it('returns true for valid addresses', () => {
      expect(StarknetAddress.isValid('0x123')).toBe(true);
      expect(StarknetAddress.isValid('0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7')).toBe(true);
    });

    it('returns false for invalid addresses', () => {
      expect(StarknetAddress.isValid('123')).toBe(false);
      expect(StarknetAddress.isValid('0xGGG')).toBe(false);
    });

    it('returns false for zero address', () => {
      expect(StarknetAddress.isValid('0x0')).toBe(false);
    });

    it('returns false for value >= felt252 prime', () => {
      expect(StarknetAddress.isValid('0x' + 'f'.repeat(64))).toBe(false);
    });
  });
});

describe('CredentialId', () => {
  describe('of', () => {
    it('creates CredentialId from valid base64url string', () => {
      const credId = CredentialId.of('dGVzdC1jcmVkZW50aWFsLWlk');
      expect(credId).toBe('dGVzdC1jcmVkZW50aWFsLWlk');
    });

    it('throws ValidationError for empty string', () => {
      expect(() => CredentialId.of('')).toThrow();
    });
  });
});
