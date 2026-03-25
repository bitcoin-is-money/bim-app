
export const WBTCToken = {
  symbol: 'WBTC',
  decimals: 8,
} as const;

export const STRKToken = {
  symbol: 'STRK',
  decimals: 18,
} as const;

type Token = typeof WBTCToken | typeof STRKToken;

export interface TokenBalance<T extends Token = Token> {
  symbol: T['symbol'];
  amount: string;
  decimals: T['decimals'];
}

export type WBTCTokenBalance = TokenBalance<typeof WBTCToken>;
export type STRKTokenBalance = TokenBalance<typeof STRKToken>;

export namespace Token {

  export function zeroBalance<T extends Token>(token: T): TokenBalance<T> {
    return {symbol: token.symbol, amount: '0', decimals: token.decimals};
  }
}
