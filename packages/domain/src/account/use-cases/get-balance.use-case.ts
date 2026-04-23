import type {STRKTokenBalance, WBTCTokenBalance} from '../balance';
import type {AccountId} from '../types';

export interface GetBalanceInput {
  accountId: AccountId;
}

export interface GetBalanceOutput {
  wbtcBalance: WBTCTokenBalance;
  strkBalance: STRKTokenBalance;
}

/**
 * Retrieves token balances for an account's Starknet address.
 */
export interface GetBalanceUseCase {
  execute(input: GetBalanceInput): Promise<GetBalanceOutput>;
}
