
export const WBTCToken = {
  symbol: 'WBTC',
  decimals: 8,
} as const;

export interface WBTCTokenBalance {
  symbol: typeof WBTCToken['symbol'];
  amount: string;
  decimals: typeof WBTCToken['decimals'];
}

export namespace WBTCTokenBalance {

  export function zero(): WBTCTokenBalance {
    return {
      symbol: WBTCToken.symbol,
      amount: '0',
      decimals: WBTCToken.decimals,
    };
  }
}

export const STRKToken = {
  symbol: 'STRK',
  decimals: 18,
} as const;

export interface STRKTokenBalance {
  symbol: typeof STRKToken['symbol'];
  amount: string;
  decimals: typeof STRKToken['decimals'];
}

export namespace STRKTokenBalance {

  export function zero(): STRKTokenBalance {
    return {
      symbol: STRKToken.symbol,
      amount: '0',
      decimals: STRKToken.decimals,
    };
  }
}

