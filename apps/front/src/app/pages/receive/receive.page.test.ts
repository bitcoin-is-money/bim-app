import {describe, expect, it} from 'vitest';

const WBTC_TOKEN_ADDRESS = '0x00abbd7d98ad664568f204d6e1af6e02d6a5c55eb4e83c9fbbfc3ed8514efc09';

function buildStarknetUri(
  address: string,
  amountSats?: number,
  description?: string,
): string {
  if (!address) return '';

  const hasAmount = amountSats !== undefined && amountSats > 0;
  const hasDesc = !!description;

  if (!hasAmount && !hasDesc) {
    return `starknet:${address}`;
  }

  const params = new URLSearchParams();
  if (hasAmount) {
    params.set('amount', String(Math.round(amountSats)));
    params.set('token', WBTC_TOKEN_ADDRESS);
  }
  if (hasDesc) {
    params.set('summary', description);
  }

  return `starknet:${address}?${params.toString()}`;
}

describe('ReceivePage - Starknet URI building', () => {
  const address = '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7';

  it('should return empty string for empty address', () => {
    expect(buildStarknetUri('')).toBe('');
  });

  it('should return address-only URI when no amount or description', () => {
    expect(buildStarknetUri(address)).toBe(`starknet:${address}`);
  });

  it('should return address-only URI when amount is 0', () => {
    expect(buildStarknetUri(address, 0)).toBe(`starknet:${address}`);
  });

  it('should include amount and token when amount > 0', () => {
    const uri = buildStarknetUri(address, 50000);
    expect(uri).toContain(`starknet:${address}?`);
    expect(uri).toContain('amount=50000');
    expect(uri).toContain(`token=${WBTC_TOKEN_ADDRESS}`);
  });

  it('should round amount to integer', () => {
    const uri = buildStarknetUri(address, 12345.67);
    expect(uri).toContain('amount=12346');
  });

  it('should include summary when description is provided', () => {
    const uri = buildStarknetUri(address, 0, 'Coffee');
    expect(uri).toContain('summary=Coffee');
    expect(uri).not.toContain('amount=');
  });

  it('should include both amount and summary', () => {
    const uri = buildStarknetUri(address, 10000, 'Lunch reimbursement');
    expect(uri).toContain('amount=10000');
    expect(uri).toContain(`token=${WBTC_TOKEN_ADDRESS}`);
    expect(uri).toContain('summary=Lunch+reimbursement');
  });

  it('should URL-encode special characters in description', () => {
    const uri = buildStarknetUri(address, 0, 'Hello & World');
    expect(uri).toContain('summary=Hello+%26+World');
  });
});
