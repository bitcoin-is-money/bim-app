import {buildBip21Uri} from '@bim/lib/bitcoin';
import {describe, expect, it} from 'vitest';

describe('buildBip21Uri', () => {
  const address = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';

  it('returns a bare bitcoin URI when no params are provided', () => {
    expect(buildBip21Uri(address)).toBe(`bitcoin:${address}`);
  });

  it('includes the amount when provided', () => {
    expect(buildBip21Uri(address, {amount: 0.001})).toBe(`bitcoin:${address}?amount=0.001`);
  });

  it('preserves an explicit zero amount', () => {
    expect(buildBip21Uri(address, {amount: 0})).toBe(`bitcoin:${address}?amount=0`);
  });

  it('URL-encodes labels and messages that contain spaces or special characters', () => {
    const uri = buildBip21Uri(address, {label: 'Alice & Bob', message: 'pour un café'});
    expect(uri).toBe(`bitcoin:${address}?label=Alice+%26+Bob&message=pour+un+caf%C3%A9`);
  });

  it('combines amount, label and message in BIP-21 order', () => {
    const uri = buildBip21Uri(address, {amount: 0.5, label: 'Alice', message: 'Thanks'});
    expect(uri).toBe(`bitcoin:${address}?amount=0.5&label=Alice&message=Thanks`);
  });

  it('parses back into the expected fields via URL + URLSearchParams', () => {
    const uri = buildBip21Uri(address, {amount: 0.25, label: 'Alice'});
    const parsed = new URL(uri);
    expect(parsed.protocol).toBe('bitcoin:');
    expect(parsed.pathname).toBe(address);
    expect(parsed.searchParams.get('amount')).toBe('0.25');
    expect(parsed.searchParams.get('label')).toBe('Alice');
  });
});
