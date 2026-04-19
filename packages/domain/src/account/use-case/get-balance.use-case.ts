import type {STRKTokenBalance, WBTCTokenBalance} from '../balance';

export interface GetBalanceInput {
  accountId: string;
}

export interface GetBalanceOutput {
  wbtcBalance: WBTCTokenBalance;
  strkBalance: STRKTokenBalance;
}

/**
 * Retrieves token balances for an account's Starknet address.
 */
export interface GetBalanceUseCase {
  getBalance(input: GetBalanceInput): Promise<GetBalanceOutput>;
}
