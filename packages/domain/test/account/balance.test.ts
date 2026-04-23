import {STRKToken, Token, WBTCToken} from '@bim/domain/account';
import {describe, expect, it} from 'vitest';

describe('Token.zeroBalance', () => {
  it('returns a zero WBTC balance with correct symbol and decimals', () => {
    const balance = Token.zeroBalance(WBTCToken);

    expect(balance).toEqual({
      symbol: 'WBTC',
      amount: '0',
      decimals: 8,
    });
  });

  it('returns a zero STRK balance with correct symbol and decimals', () => {
    const balance = Token.zeroBalance(STRKToken);

    expect(balance).toEqual({
      symbol: 'STRK',
      amount: '0',
      decimals: 18,
    });
  });
});
