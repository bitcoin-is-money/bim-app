
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

