import type {AccountRepository, StarknetGateway} from '../ports';
import {WBTCToken, WBTCTokenBalance} from './balance';
import {AccountId, AccountNotFoundError, type StarknetAddress} from './types';

export interface GetBalanceDeps {
  accountRepository: AccountRepository;
  starknetGateway: StarknetGateway;
}

export interface GetBalanceOutput {
  wbtcBalance: WBTCTokenBalance;
}

export type GetBalanceService = (input: { accountId: string }) => Promise<GetBalanceOutput>;

/**
 * Fetches token balances for an account's Starknet address.
 * Returns zero balances if the account is not deployed yet.
 */
export function getGetBalanceService(deps: GetBalanceDeps): GetBalanceService {
  return async (input): Promise<GetBalanceOutput> => {
    const accountId = AccountId.of(input.accountId);
    const account = await deps.accountRepository.findById(accountId);

    if (!account) {
      throw new AccountNotFoundError(accountId);
    }

    if (!account.isDeployed()) {
      return { wbtcBalance: WBTCTokenBalance.zero() };
    }

    const address: StarknetAddress = account.getStarknetAddress()!;
    let amount: bigint;
    try {
      amount = await deps.starknetGateway.getBalance({
        address,
        token: WBTCToken.symbol,
      });
    } catch {
      console.warn(`Failed to fetch balance for ${address}`);
      amount = BigInt(0);
    }
    return {
      wbtcBalance: {
        symbol: WBTCToken.symbol,
        amount: amount.toString(),
        decimals: WBTCToken.decimals
      }
    };
  };
}


