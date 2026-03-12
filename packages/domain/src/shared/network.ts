export type BitcoinNetwork = 'mainnet' | 'testnet';

export type StarknetNetwork = 'mainnet' | 'testnet' | 'devnet';

export namespace StarknetNetwork {
  export function toBitcoinNetwork(network: StarknetNetwork): BitcoinNetwork {
    return network === 'mainnet' ? 'mainnet' : 'testnet';
  }
}
