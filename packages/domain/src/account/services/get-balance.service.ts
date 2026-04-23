import {serializeError} from '@bim/lib/error';
import type {Logger} from 'pino';
import type {AccountRepository, StarknetGateway} from '../../ports';
import {STRKToken, Token, WBTCToken} from '../balance';
import {AccountNotFoundError, InvalidAccountStateError} from '../errors';
import type {
  GetBalanceInput,
  GetBalanceOutput,
  GetBalanceUseCase,
} from '../use-cases/get-balance.use-case';

export interface GetBalanceDeps {
  accountRepository: AccountRepository;
  starknetGateway: StarknetGateway;
  logger: Logger;
}

/**
 * Retrieves token balances for an account's Starknet address.
 * Returns zero balances if the account is not deployed yet.
 */
export class GetBalance implements GetBalanceUseCase {
  private readonly log: Logger;

  constructor(private readonly deps: GetBalanceDeps) {
    this.log = deps.logger.child({name: 'get-balance.service.ts'});
  }

  async execute({accountId}: GetBalanceInput): Promise<GetBalanceOutput> {
    const account = await this.deps.accountRepository.findById(accountId);

    if (!account) {
      throw new AccountNotFoundError(accountId);
    }

    if (!account.isDeployed()) {
      return {
        wbtcBalance: Token.zeroBalance(WBTCToken),
        strkBalance: Token.zeroBalance(STRKToken),
      };
    }

    const address = account.getStarknetAddress();
    if (!address) {
      throw new InvalidAccountStateError(
        account.getStatus(),
        'get balance',
        'deployed account has no starknet address',
      );
    }

    const fetchBalance = async (token: string): Promise<bigint> => {
      try {
        return await this.deps.starknetGateway.getBalance({address, token});
      } catch (err) {
        this.log.warn({address, token}, `Failed to fetch balance (${serializeError(err)})`);
        return 0n;
      }
    };

    const [wbtcAmount, strkAmount] = await Promise.all([
      fetchBalance(WBTCToken.symbol),
      fetchBalance(STRKToken.symbol),
    ]);

    return {
      wbtcBalance: {
        symbol: WBTCToken.symbol,
        amount: wbtcAmount.toString(),
        decimals: WBTCToken.decimals,
      },
      strkBalance: {
        symbol: STRKToken.symbol,
        amount: strkAmount.toString(),
        decimals: STRKToken.decimals,
      },
    };
  }
}
