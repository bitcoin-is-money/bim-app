import type {StarknetAddress} from '@bim/domain/account';
import type {AvnuPaymasterGateway} from '@bim/starknet';
import {Account, CallData, RpcProvider, Signer} from 'starknet';
import {STRK_TOKEN_ADDRESS} from '../config/constants.js';
import type {AvnuSecrets} from '../config/secrets.js';

/**
 * High-level client for AVNU paymaster operations.
 * Wraps the low-level AvnuPaymasterGateway for CLI-friendly usage.
 */
export class AvnuPaymaster {
  constructor(private readonly gateway: AvnuPaymasterGateway) {}

  async getCredits(): Promise<bigint> {
    return this.gateway.getRemainingCredits();
  }

  /**
   * Sends STRK from the treasury to the AVNU paymaster to top up sponsor credits.
   * Executes an approve + funding multicall and waits for confirmation.
   */
  async refund(
    rpcUrl: string,
    treasuryAddress: StarknetAddress,
    treasuryPrivateKey: string,
    amountWei: bigint,
    avnuSecrets: AvnuSecrets,
  ): Promise<string> {
    const provider = new RpcProvider({nodeUrl: rpcUrl});
    const signer = new Signer(treasuryPrivateKey);
    const account = new Account({provider, address: treasuryAddress.toString(), signer});

    const approveCall = {
      contractAddress: STRK_TOKEN_ADDRESS,
      entrypoint: 'approve',
      calldata: CallData.compile({
        spender: avnuSecrets.contractEntryPoint,
        amount: {low: amountWei, high: 0n},
      }),
    };

    const fundingCall = {
      contractAddress: avnuSecrets.contractEntryPoint,
      entrypoint: 'funding',
      calldata: CallData.compile({
        amount: {low: amountWei, high: 0n},
        api_key_hash: avnuSecrets.publicIdHash,
      }),
    };

    const {transaction_hash: txHash} = await account.execute([approveCall, fundingCall]);
    await provider.waitForTransaction(txHash);
    return txHash;
  }
}
