export type Network = 'testnet' | 'mainnet';

export const RPC_URLS: Record<Network, string> = {
  testnet: 'https://api.cartridge.gg/x/starknet/sepolia',
  mainnet: 'https://api.cartridge.gg/x/starknet/mainnet',
};

export const STRK_TOKEN_ADDRESS = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';
export const WBTC_TOKEN_ADDRESS = '0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac';
export const AVNU_ADDRESS = '0x02698cf1e909bc26d684182ce66222f5a60588ccc6b455ee4622e3483208435f';

export const OZ_ACCOUNT_CLASS_HASH = '0x540d7f5ec7ecf317e68d48564934cb99259781b1ee3cedbbc37ec5337f8e688';
export const BIM_CLASS_HASH = '0x04bc5b0950521985d3f8db954fc6ae3832122c6ee4cd770efdbf87437699ce48';
export const COMPILED_CLASS_HASH = '0xc12444dab1aaa9d1c7fc5d2ca7f51660a1607fb01143da42ebc93a2a30479d';

export const STRK_DECIMALS = 18;
export const WBTC_DECIMALS = 8;

export const STARKNET_FAUCET_URL = 'https://starknet-faucet.vercel.app/';
