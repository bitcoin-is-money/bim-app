import {WebauthnUserHandleDecoder} from '@bim/lib/auth';
import {UuidCodec} from '@bim/lib/encoding';
import {describe, expect, it} from 'vitest';

describe('WebauthnUserHandleDecoder', () => {
  describe('decodeToUuid', () => {
    it('decodes a base64url-encoded userHandle to UUID format', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      expect(WebauthnUserHandleDecoder.decodeToUuid(UuidCodec.toBase64Url(uuid))).toBe(uuid);
    });

    it('decodes all-zeros userHandle', () => {
      const uuid = '00000000-0000-0000-0000-000000000000';
      expect(WebauthnUserHandleDecoder.decodeToUuid(UuidCodec.toBase64Url(uuid))).toBe(uuid);
    });

    it('decodes all-ones userHandle', () => {
      const uuid = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
      expect(WebauthnUserHandleDecoder.decodeToUuid(UuidCodec.toBase64Url(uuid))).toBe(uuid);
    });

    it('roundtrips random UUID', () => {
      const uuid = crypto.randomUUID();
      expect(WebauthnUserHandleDecoder.decodeToUuid(UuidCodec.toBase64Url(uuid))).toBe(uuid);
    });
  });
});
