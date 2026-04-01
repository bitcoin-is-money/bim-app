import {Account, RpcProvider, Signer} from 'starknet';
import {type Network, RPC_URLS, STRK_TOKEN_ADDRESS, WBTC_TOKEN_ADDRESS} from '../config/constants.js';
import type {StarknetAccountSecrets} from '../config/secrets.js';

export function createProvider(network: Network): RpcProvider {
  return new RpcProvider({nodeUrl: RPC_URLS[network]});
}

export function createAccount(
  provider: RpcProvider,
  secrets: StarknetAccountSecrets,
): Account {
  const signer = new Signer(secrets.privateKey);
  return new Account({provider, address: secrets.address, signer});
}

export async function getTokenBalance(
  provider: RpcProvider,
  address: string,
  tokenAddress: string,
): Promise<bigint> {
  const result = await provider.callContract({
    contractAddress: tokenAddress,
    entrypoint: 'balanceOf',
    calldata: [address],
  });
  const raw = result[0];
  if (raw === undefined) throw new Error('balanceOf returned empty result');
  return BigInt(raw);
}

export async function getStrkBalance(
  provider: RpcProvider,
  address: string,
): Promise<bigint> {
  return getTokenBalance(provider, address, STRK_TOKEN_ADDRESS);
}

export async function getWbtcBalance(
  provider: RpcProvider,
  address: string,
): Promise<bigint> {
  return getTokenBalance(provider, address, WBTC_TOKEN_ADDRESS);
}
