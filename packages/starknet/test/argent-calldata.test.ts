import {describe, expect, it} from 'vitest';
import {ARGENT_WEBAUTHN_SALT, buildArgentWebauthnCalldata} from '../src';

describe('buildArgentWebauthnCalldata', () => {
  const PUBLIC_KEY = '0x' + 'ab'.repeat(32); // 256-bit X-coordinate

  it('starts with the Webauthn signer variant index (4)', () => {
    const calldata = buildArgentWebauthnCalldata({
      origin: 'http://localhost:8080',
      rpId: 'localhost',
      publicKey: PUBLIC_KEY,
    });
    expect(calldata[0]).toBe('0x4');
  });

  it('encodes the origin length and its ASCII bytes after the variant', () => {
    const origin = 'abc';
    const calldata = buildArgentWebauthnCalldata({origin, rpId: 'localhost', publicKey: PUBLIC_KEY});
    // [0]=variant, [1]=origin_len, [2..4]=bytes
    expect(calldata[1]).toBe('0x3');
    expect(calldata[2]).toBe('0x61'); // 'a'
    expect(calldata[3]).toBe('0x62'); // 'b'
    expect(calldata[4]).toBe('0x63'); // 'c'
  });

  it('ends with OPTION_NONE for the guardian field', () => {
    const calldata = buildArgentWebauthnCalldata({
      origin: 'http://localhost:8080',
      rpId: 'localhost',
      publicKey: PUBLIC_KEY,
    });
    expect(calldata.at(-1)).toBe('0x1');
  });

  it('splits the 256-bit public key into low/high 128-bit felts', () => {
    const pk = '0x' + '0'.repeat(32) + 'f'.repeat(32); // high=0, low=2^128-1
    const calldata = buildArgentWebauthnCalldata({
      origin: 'x',
      rpId: 'localhost',
      publicKey: pk,
    });
    // [0]=variant, [1]=origin_len=1, [2]=byte 'x', [3..4]=rpId hash (low, high), [5..6]=pubkey (low, high)
    expect(calldata[5]).toBe('0x' + 'f'.repeat(32));
    expect(calldata[6]).toBe('0x0');
  });

  it('uses a stable SHA-256 hash for rpId', () => {
    const a = buildArgentWebauthnCalldata({origin: 'x', rpId: 'localhost', publicKey: PUBLIC_KEY});
    const b = buildArgentWebauthnCalldata({origin: 'x', rpId: 'localhost', publicKey: PUBLIC_KEY});
    expect(a).toEqual(b);
  });

  it('produces different calldata for different rpIds', () => {
    const a = buildArgentWebauthnCalldata({origin: 'x', rpId: 'localhost', publicKey: PUBLIC_KEY});
    const b = buildArgentWebauthnCalldata({origin: 'x', rpId: 'example.com', publicKey: PUBLIC_KEY});
    expect(a).not.toEqual(b);
  });

  it('exposes the Argent deployment salt constant', () => {
    expect(ARGENT_WEBAUTHN_SALT).toBe('0xc');
  });
});
