import {StarknetAddress} from '@bim/domain/account';
import type {StarknetRpcGateway} from '@bim/starknet';
import {Account, RpcProvider, Signer} from 'starknet';
import {WBTC_TOKEN_ADDRESS} from '../config/constants.js';

export interface TreasuryBalance {
  readonly address: string;
  readonly strk: bigint;
  readonly wbtc: bigint;
}

/**
 * Represents the BIM treasury account on Starknet.
 * Provides balance queries and fund transfer operations.
 */
export class Treasury {
  private readonly address: StarknetAddress;

  constructor(
    private readonly starknet: StarknetRpcGateway,
    private readonly rpcUrl: string,
    address: string,
    private readonly privateKey: string,
  ) {
    this.address = StarknetAddress.of(address);
  }

  async getBalance(): Promise<TreasuryBalance> {
    const strk = await this.starknet.getBalance({address: this.address, token: 'STRK'});
    const wbtc = await this.starknet.getBalance({address: this.address, token: 'WBTC'});
    return {address: this.address.toString(), strk, wbtc};
  }

  /**
   * Transfers WBTC from the treasury to a target address.
   * Waits for on-chain confirmation and returns the transaction hash.
   */
  async fund(
    targetAddress: StarknetAddress,
    amountSats: bigint,
  ): Promise<string> {
    const provider = new RpcProvider({nodeUrl: this.rpcUrl});
    const signer = new Signer(this.privateKey);
    const account = new Account({provider, address: this.address.toString(), signer});

    const {transaction_hash: txHash} = await account.execute({
      contractAddress: WBTC_TOKEN_ADDRESS,
      entrypoint: 'transfer',
      calldata: [targetAddress.toString(), amountSats.toString(), '0'],
    });

    await provider.waitForTransaction(txHash);
    return txHash;
  }
}
