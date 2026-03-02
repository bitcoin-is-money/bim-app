// @noble/curves v1 imports — pinned due to @noble/hashes 1.8.0 override (starknet compat)
// TODO: when upgrading to v2, change to: '@noble/curves/utils.js' and '@noble/curves/nist.js'
/* eslint-disable @typescript-eslint/no-deprecated */
import {bytesToHex, hexToBytes} from '@noble/curves/abstract/utils';
import {p256} from '@noble/curves/p256';
import {describe, expect, it} from 'vitest';
import {P256Signer} from '@bim/test-toolkit/crypto';

describe('P256Signer', () => {
  // Known test private key (32 bytes hex)
  const TEST_PRIVATE_KEY_HEX =
    '5c611a4c560b27d2124d37f0a1640fe7b04690cb7fb345314e75fa599419866c';

  describe('generate', () => {
    it('creates a signer with a random key pair', () => {
      const signer = P256Signer.generate();

      expect(signer.getPrivateKeyBytes()).toBeInstanceOf(Uint8Array);
      expect(signer.getPrivateKeyBytes()).toHaveLength(32);
    });

    it('generates different keys on each call', () => {
      const signer1 = P256Signer.generate();
      const signer2 = P256Signer.generate();

      expect(signer1.getPrivateKeyHex()).not.toBe(signer2.getPrivateKeyHex());
    });
  });

  describe('fromHex', () => {
    it('creates a signer from a hex-encoded private key', () => {
      const signer = P256Signer.fromHex(TEST_PRIVATE_KEY_HEX);

      expect(signer.getPrivateKeyHex()).toBe(TEST_PRIVATE_KEY_HEX);
    });

    it('derives the correct public key from private key', () => {
      const signer = P256Signer.fromHex(TEST_PRIVATE_KEY_HEX);

      // Verify against @noble/curves directly
      const expectedPublicKey = p256
        .getPublicKey(hexToBytes(TEST_PRIVATE_KEY_HEX), false);
      const {x, y} = signer.getPublicKey();
      const actualPublicKey = new Uint8Array([0x04, ...x, ...y]);

      expect(bytesToHex(actualPublicKey)).toBe(bytesToHex(expectedPublicKey));
    });
  });

  describe('getPublicKey', () => {
    it('returns x and y coordinates as Uint8Array', () => {
      const signer = P256Signer.fromHex(TEST_PRIVATE_KEY_HEX);
      const {x, y} = signer.getPublicKey();

      expect(x).toBeInstanceOf(Uint8Array);
      expect(y).toBeInstanceOf(Uint8Array);
      expect(x).toHaveLength(32);
      expect(y).toHaveLength(32);
    });

    it('returns consistent coordinates for the same key', () => {
      const signer1 = P256Signer.fromHex(TEST_PRIVATE_KEY_HEX);
      const signer2 = P256Signer.fromHex(TEST_PRIVATE_KEY_HEX);

      expect(bytesToHex(signer1.getPublicKey().x)).toBe(bytesToHex(signer2.getPublicKey().x));
      expect(bytesToHex(signer1.getPublicKey().y)).toBe(bytesToHex(signer2.getPublicKey().y));
    });
  });

  describe('getPublicKeyX', () => {
    it('returns X coordinate as hex string with 0x prefix', () => {
      const signer = P256Signer.fromHex(TEST_PRIVATE_KEY_HEX);
      const publicKeyX = signer.getPublicKeyX();

      expect(publicKeyX).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it('matches the x coordinate from getPublicKey', () => {
      const signer = P256Signer.fromHex(TEST_PRIVATE_KEY_HEX);
      const {x} = signer.getPublicKey();

      expect(signer.getPublicKeyX()).toBe('0x' + bytesToHex(x));
    });
  });

  describe('getPrivateKeyHex', () => {
    it('returns the private key as hex string', () => {
      const signer = P256Signer.fromHex(TEST_PRIVATE_KEY_HEX);

      expect(signer.getPrivateKeyHex()).toBe(TEST_PRIVATE_KEY_HEX);
    });

    it('returns 64 character hex string (32 bytes)', () => {
      const signer = P256Signer.generate();

      expect(signer.getPrivateKeyHex()).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('getPrivateKeyBytes', () => {
    it('returns the private key as Uint8Array', () => {
      const signer = P256Signer.fromHex(TEST_PRIVATE_KEY_HEX);

      expect(signer.getPrivateKeyBytes()).toBeInstanceOf(Uint8Array);
      expect(signer.getPrivateKeyBytes()).toHaveLength(32);
    });

    it('matches the hex representation', () => {
      const signer = P256Signer.fromHex(TEST_PRIVATE_KEY_HEX);

      expect(bytesToHex(signer.getPrivateKeyBytes())).toBe(signer.getPrivateKeyHex());
    });
  });

  describe('sign', () => {
    it('returns signature with r and s as bigint', () => {
      const signer = P256Signer.fromHex(TEST_PRIVATE_KEY_HEX);
      const data = new Uint8Array(32).fill(0xab);

      const {r, s} = signer.sign(data);

      expect(typeof r).toBe('bigint');
      expect(typeof s).toBe('bigint');
      expect(r).toBeGreaterThan(0n);
      expect(s).toBeGreaterThan(0n);
    });

    it('produces deterministic signatures for the same data', () => {
      const signer = P256Signer.fromHex(TEST_PRIVATE_KEY_HEX);
      const data = new Uint8Array(32).fill(0xab);

      const sig1 = signer.sign(data);
      const sig2 = signer.sign(data);

      expect(sig1.r).toBe(sig2.r);
      expect(sig1.s).toBe(sig2.s);
    });

    it('produces different signatures for different data', () => {
      const signer = P256Signer.fromHex(TEST_PRIVATE_KEY_HEX);
      const data1 = new Uint8Array(32).fill(0xab);
      const data2 = new Uint8Array(32).fill(0xcd);

      const sig1 = signer.sign(data1);
      const sig2 = signer.sign(data2);

      expect(sig1.r === sig2.r && sig1.s === sig2.s).toBe(false);
    });

    it('produces verifiable signatures', () => {
      const signer = P256Signer.fromHex(TEST_PRIVATE_KEY_HEX);
      const data = new Uint8Array(32).fill(0xab);

      const {r, s} = signer.sign(data);

      // Reconstruct the full public key (uncompressed)
      const {x, y} = signer.getPublicKey();
      const publicKey = new Uint8Array([0x04, ...x, ...y]);

      // Verify using @noble/curves
      const signature = new p256.Signature(r, s);
      const isValid = p256.verify(signature, data, publicKey);

      expect(isValid).toBe(true);
    });

    it('uses lowS normalization', () => {
      const signer = P256Signer.fromHex(TEST_PRIVATE_KEY_HEX);
      const data = new Uint8Array(32).fill(0xab);

      const {s} = signer.sign(data);

      // lowS means s <= n/2 where n is the curve order
      const halfOrder = p256.CURVE.n / 2n;
      expect(s).toBeLessThanOrEqual(halfOrder);
    });
  });

  describe('signHash', () => {
    it('signs a hex hash without 0x prefix', () => {
      const signer = P256Signer.fromHex(TEST_PRIVATE_KEY_HEX);
      const hexHash = 'abcd1234'.padStart(64, '0');

      const {r, s} = signer.signHash(hexHash);

      expect(typeof r).toBe('bigint');
      expect(typeof s).toBe('bigint');
    });

    it('signs a hex hash with 0x prefix', () => {
      const signer = P256Signer.fromHex(TEST_PRIVATE_KEY_HEX);
      const hexHash = '0x' + 'abcd1234'.padStart(64, '0');

      const {r, s} = signer.signHash(hexHash);

      expect(typeof r).toBe('bigint');
      expect(typeof s).toBe('bigint');
    });

    it('produces the same signature with or without 0x prefix', () => {
      const signer = P256Signer.fromHex(TEST_PRIVATE_KEY_HEX);
      const hashWithoutPrefix = 'abcd1234'.padStart(64, '0');
      const hashWithPrefix = '0x' + hashWithoutPrefix;

      const sig1 = signer.signHash(hashWithoutPrefix);
      const sig2 = signer.signHash(hashWithPrefix);

      expect(sig1.r).toBe(sig2.r);
      expect(sig1.s).toBe(sig2.s);
    });

    it('produces the same result as sign with equivalent bytes', () => {
      const signer = P256Signer.fromHex(TEST_PRIVATE_KEY_HEX);
      const hexHash = 'abcd1234'.padStart(64, '0');
      const bytes = hexToBytes(hexHash);

      const sigFromHash = signer.signHash(hexHash);
      const sigFromBytes = signer.sign(bytes);

      expect(sigFromHash.r).toBe(sigFromBytes.r);
      expect(sigFromHash.s).toBe(sigFromBytes.s);
    });

    it('produces verifiable signatures for Starknet-style hashes', () => {
      const signer = P256Signer.fromHex(TEST_PRIVATE_KEY_HEX);
      // Simulated Starknet transaction hash (252 bits, fits in 32 bytes)
      const starknetHash = '0x04a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9';

      const {r, s} = signer.signHash(starknetHash);

      // Verify the signature
      const {x, y} = signer.getPublicKey();
      const publicKey = new Uint8Array([0x04, ...x, ...y]);
      const hashBytes = hexToBytes(starknetHash.replace('0x', ''));
      const signature = new p256.Signature(r, s);

      expect(p256.verify(signature, hashBytes, publicKey)).toBe(true);
    });
  });
});
